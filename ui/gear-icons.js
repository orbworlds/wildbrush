/**
 * Painted canvas icons for the Glowcap Lantern, the Ember and Frost Crests and the Cloudstep Boots, with sparkle, glow and gold-gradient helpers.
 */
import { makeRng } from '../core/math.js';
import { brushStroke, makeCanvas } from './brush.js';
const TWO_PI = Math.PI * 2;
function fillSparkle(g, cx, cy, size) {
  g.beginPath();
  g.moveTo(cx, cy - size * 2);
  g.quadraticCurveTo(cx + size * 0.25, cy - size * 0.25, cx + size * 2, cy);
  g.quadraticCurveTo(cx + size * 0.25, cy + size * 0.25, cx, cy + size * 2);
  g.quadraticCurveTo(cx - size * 0.25, cy + size * 0.25, cx - size * 2, cy);
  g.quadraticCurveTo(cx - size * 0.25, cy - size * 0.25, cx, cy - size * 2);
  g.fill();
}
function fillGlow(g, cx, cy, inner, outer, rgb, alpha) {
  const gradient = g.createRadialGradient(cx, cy, inner, cx, cy, outer);
  gradient.addColorStop(0, `rgba(${rgb},${alpha})`);
  gradient.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gradient;
  g.fillRect(cx - outer, cy - outer, outer * 2, outer * 2);
}
function goldGradient(g, y0, y1, light = '#fff0b0', mid = '#f0b93a', dark = '#9a6414') {
  const gradient = g.createLinearGradient(0, y0, 0, y1);
  gradient.addColorStop(0, light);
  gradient.addColorStop(0.45, mid);
  gradient.addColorStop(1, dark);
  return gradient;
}
export function lanternIcon(size) {
  const px = size * 16;
  const { canvas, g } = makeCanvas(px, px, 3);
  const unit = px / 40;
  const cx = px / 2;
  fillGlow(g, cx, unit * 22, unit * 3, unit * 19, '255,196,110', 0.7);
  fillGlow(g, cx, unit * 22, unit * 1, unit * 9, '255,236,190', 0.8);
  const outline = 'rgba(20,12,8,0.85)';
  g.strokeStyle = goldGradient(g, unit * 3, unit * 8);
  g.lineWidth = unit * 1.3;
  g.beginPath();
  g.arc(cx, unit * 5.6, unit * 2.2, 0, TWO_PI);
  g.stroke();
  g.fillStyle = goldGradient(g, unit * 8, unit * 14);
  g.beginPath();
  g.moveTo(cx - unit * 2, unit * 8);
  g.lineTo(cx + unit * 2, unit * 8);
  g.quadraticCurveTo(cx + unit * 7, unit * 11, cx + unit * 9.5, unit * 13.4);
  g.lineTo(cx - unit * 9.5, unit * 13.4);
  g.quadraticCurveTo(cx - unit * 7, unit * 11, cx - unit * 2, unit * 8);
  g.closePath();
  g.fill();
  g.strokeStyle = outline;
  g.lineWidth = unit * 0.6;
  g.stroke();
  g.fillStyle = goldGradient(g, unit * 13, unit * 15.5, '#ffe28a', '#d69a2c', '#7a4c12');
  g.beginPath();
  g.roundRect(cx - unit * 9.5, unit * 13, unit * 19, unit * 2.4, unit * 1.1);
  g.fill();
  g.stroke();
  const glassX = cx - unit * 7.2;
  const glassY = unit * 15.4;
  const glassW = unit * 14.4;
  const glassH = unit * 14.2;
  g.save();
  g.beginPath();
  g.roundRect(glassX, glassY, glassW, glassH, unit * 2.6);
  g.clip();
  const gradient = g.createRadialGradient(cx, unit * 22, unit * 1, cx, unit * 22, unit * 10);
  gradient.addColorStop(0, '#fffbe8');
  gradient.addColorStop(0.35, '#ffe39a');
  gradient.addColorStop(0.75, '#ffab3e');
  gradient.addColorStop(1, '#d9701c');
  g.fillStyle = gradient;
  g.fillRect(glassX, glassY, glassW, glassH);
  g.fillStyle = '#fff6dc';
  g.beginPath();
  g.roundRect(cx - unit * 1.3, unit * 22, unit * 2.6, unit * 6.5, unit * 1);
  g.fill();
  const gradient2 = g.createLinearGradient(0, unit * 17, 0, unit * 23);
  gradient2.addColorStop(0, '#fff2c8');
  gradient2.addColorStop(1, '#ff9a3a');
  g.fillStyle = gradient2;
  g.beginPath();
  g.moveTo(cx - unit * 5, unit * 23);
  g.quadraticCurveTo(cx - unit * 4.6, unit * 17.4, cx, unit * 17.2);
  g.quadraticCurveTo(cx + unit * 4.6, unit * 17.4, cx + unit * 5, unit * 23);
  g.quadraticCurveTo(cx, unit * 21.8, cx - unit * 5, unit * 23);
  g.fill();
  g.fillStyle = 'rgba(255,255,245,0.95)';
  for (const [bx, by, br] of [
    [-2.2, 19.6, 0.8],
    [1.4, 18.8, 0.6],
    [2.8, 21, 0.55],
    [-0.4, 20.8, 0.5],
  ]) {
    g.beginPath();
    g.arc(cx + bx * unit, by * unit, br * unit, 0, TWO_PI);
    g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.beginPath();
  g.ellipse(glassX + glassW * 0.2, glassY + glassH * 0.32, unit * 1.1, unit * 3.6, 0.12, 0, TWO_PI);
  g.fill();
  g.restore();
  g.strokeStyle = goldGradient(g, glassY, glassY + glassH);
  g.lineWidth = unit * 1.1;
  for (const barX of [glassX + unit * 0.4, cx, glassX + glassW - unit * 0.4]) {
    g.beginPath();
    g.moveTo(barX, glassY);
    g.lineTo(barX, glassY + glassH);
    g.stroke();
  }
  g.strokeStyle = outline;
  g.lineWidth = unit * 0.6;
  g.beginPath();
  g.roundRect(glassX, glassY, glassW, glassH, unit * 2.6);
  g.stroke();
  g.fillStyle = goldGradient(g, unit * 29.5, unit * 33, '#ffe28a', '#d69a2c', '#7a4c12');
  g.beginPath();
  g.roundRect(cx - unit * 8.6, unit * 29.4, unit * 17.2, unit * 3, unit * 1.2);
  g.fill();
  g.stroke();
  g.beginPath();
  g.arc(cx, unit * 33.6, unit * 1.3, 0, TWO_PI);
  g.fill();
  const rng = makeRng('lantern-spores');
  g.fillStyle = '#fff1c8';
  for (let i = 0; i < 7; i++)
    fillSparkle(g, px * (0.1 + rng() * 0.8), px * (0.08 + rng() * 0.35), unit * (0.4 + rng() * 0.8));
  return canvas;
}
function crestIcon(size, style) {
  const px = size * 16;
  const { canvas, g } = makeCanvas(px, px, 3);
  const unit = px / 40;
  const cx = px / 2;
  const cy = px / 2 + unit * 0.5;
  fillGlow(g, cx, cy, unit * 8, unit * 20, style.halo, 0.55);
  const outline = 'rgba(14,10,20,0.85)';
  g.fillStyle = goldGradient(g, cy - unit * 17, cy + unit * 17, style.rim[0], style.rim[1], style.rim[2]);
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * TWO_PI - Math.PI / 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const nx = -sin;
    const ny = cos;
    g.beginPath();
    g.moveTo(cx + cos * unit * 12 + nx * unit * 2.6, cy + sin * unit * 12 + ny * unit * 2.6);
    g.lineTo(cx + cos * unit * 17.2, cy + sin * unit * 17.2);
    g.lineTo(cx + cos * unit * 12 - nx * unit * 2.6, cy + sin * unit * 12 - ny * unit * 2.6);
    g.closePath();
    g.fill();
    g.strokeStyle = outline;
    g.lineWidth = unit * 0.5;
    g.stroke();
  }
  g.beginPath();
  g.arc(cx, cy, unit * 13, 0, TWO_PI);
  g.fillStyle = goldGradient(g, cy - unit * 13, cy + unit * 13, style.rim[0], style.rim[1], style.rim[2]);
  g.fill();
  g.strokeStyle = outline;
  g.lineWidth = unit * 0.8;
  g.stroke();
  const gradient = g.createRadialGradient(cx - unit * 3, cy - unit * 4, unit * 1, cx, cy, unit * 11);
  gradient.addColorStop(0, style.enamel[0]);
  gradient.addColorStop(1, style.enamel[1]);
  g.beginPath();
  g.arc(cx, cy, unit * 10.3, 0, TWO_PI);
  g.fillStyle = gradient;
  g.fill();
  g.strokeStyle = 'rgba(14,10,20,0.6)';
  g.lineWidth = unit * 0.5;
  g.stroke();
  style.glyph(g, cx, cy, unit);
  g.fillStyle = 'rgba(255,255,255,0.45)';
  g.beginPath();
  g.ellipse(cx - unit * 5, cy - unit * 5.5, unit * 3.2, unit * 1.4, -0.7, 0, TWO_PI);
  g.fill();
  const rng = makeRng(`${style.seed}-sp`);
  g.fillStyle = style.spark;
  for (let i = 0; i < 6; i++)
    fillSparkle(g, px * (0.06 + rng() * 0.88), px * (0.04 + rng() * 0.28), unit * (0.45 + rng() * 0.85));
  return canvas;
}
export function emberCrestIcon(size) {
  return crestIcon(size, {
    seed: 'ember-crest',
    rim: ['#fff0b0', '#f0b93a', '#9a6414'],
    enamel: ['#ff8a5a', '#b3200f'],
    halo: '255,120,60',
    spark: '#ffe0a0',
    glyph(g, cx, cy, unit) {
      const flame = (scale, fill) => {
        g.beginPath();
        g.moveTo(cx, cy + unit * 7 * scale);
        g.bezierCurveTo(
          cx + unit * 6 * scale,
          cy + unit * 7 * scale,
          cx + unit * 7 * scale,
          cy + unit * 1 * scale,
          cx + unit * 4 * scale,
          cy - unit * 2 * scale,
        );
        g.bezierCurveTo(
          cx + unit * 3 * scale,
          cy - unit * 4 * scale,
          cx + unit * 2.4 * scale,
          cy - unit * 5 * scale,
          cx + unit * 1.4 * scale,
          cy - unit * 8.5 * scale,
        );
        g.bezierCurveTo(
          cx + unit * 0.4 * scale,
          cy - unit * 5.5 * scale,
          cx - unit * 0.6 * scale,
          cy - unit * 4.5 * scale,
          cx - unit * 1.2 * scale,
          cy - unit * 3.6 * scale,
        );
        g.bezierCurveTo(
          cx - unit * 2 * scale,
          cy - unit * 6 * scale,
          cx - unit * 2.6 * scale,
          cy - unit * 6.2 * scale,
          cx - unit * 3.4 * scale,
          cy - unit * 7 * scale,
        );
        g.bezierCurveTo(
          cx - unit * 3.2 * scale,
          cy - unit * 3.5 * scale,
          cx - unit * 7 * scale,
          cy - unit * 1 * scale,
          cx - unit * 6 * scale,
          cy + unit * 2.5 * scale,
        );
        g.bezierCurveTo(
          cx - unit * 5 * scale,
          cy + unit * 6 * scale,
          cx - unit * 2.5 * scale,
          cy + unit * 7 * scale,
          cx,
          cy + unit * 7 * scale,
        );
        g.closePath();
        g.fillStyle = fill;
        g.fill();
      };
      flame(1, goldGradient(g, cy - unit * 8, cy + unit * 7, '#fff6c8', '#ffc44a', '#e0781c'));
      g.strokeStyle = 'rgba(80,20,6,0.7)';
      g.lineWidth = unit * 0.5;
      g.stroke();
      flame(0.45, '#fff8e0');
    },
  });
}
export function frostCrestIcon(size) {
  return crestIcon(size, {
    seed: 'frost-crest',
    rim: ['#ffffff', '#cfdcee', '#6f86a8'],
    enamel: ['#8fd8ff', '#1c5fb8'],
    halo: '120,200,255',
    spark: '#f2fbff',
    glyph(g, cx, cy, unit) {
      g.lineCap = 'round';
      for (const [width, color] of [
        [unit * 1.9, 'rgba(10,30,70,0.55)'],
        [unit * 1.1, '#f4fbff'],
      ]) {
        g.strokeStyle = color;
        g.lineWidth = width;
        for (let i = 0; i < 6; i++) {
          const angle = (i / 6) * TWO_PI - Math.PI / 2;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          g.beginPath();
          g.moveTo(cx, cy);
          g.lineTo(cx + cos * unit * 8, cy + sin * unit * 8);
          for (const [dist, len] of [
            [4, 2.6],
            [6.2, 1.8],
          ]) {
            const bx = cx + cos * unit * dist;
            const by = cy + sin * unit * dist;
            for (const spread of [-0.75, 0.75]) {
              g.moveTo(bx, by);
              g.lineTo(bx + Math.cos(angle + spread) * unit * len, by + Math.sin(angle + spread) * unit * len);
            }
          }
          g.stroke();
        }
      }
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(cx, cy, unit * 1.4, 0, TWO_PI);
      g.fill();
    },
  });
}
export function cloudstepIcon(size) {
  const px = size * 16;
  const { canvas, g } = makeCanvas(px, px, 3);
  const unit = px / 40;
  fillGlow(g, px / 2, px * 0.55, unit * 6, unit * 20, '190,225,255', 0.55);
  ((cx, cy, width, seed, alpha = 1) => {
    const rng = makeRng(seed);
    g.fillStyle = `rgba(255,255,255,${alpha})`;
    for (let i = 0; i < 6; i++) {
      const frac = i / 5;
      g.beginPath();
      g.arc(
        cx - width / 2 + frac * width,
        cy - Math.sin(frac * Math.PI) * width * 0.12 + (rng() - 0.5) * unit,
        width * (0.12 + rng() * 0.07),
        0,
        TWO_PI,
      );
      g.fill();
    }
  })(px * 0.5, px * 0.86, px * 0.7, 'cs-under', 0.95);
  const boot = (bx, by, scaleX, seed) => {
    g.save();
    g.translate(bx, by);
    g.scale(scaleX, 1);
    g.rotate(-0.12);
    const feather = (len, angle, width) => {
      g.save();
      g.translate(-unit * 3.6, -unit * 7);
      g.rotate(angle);
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(-len * 0.4, -width, -len, -width * 0.3);
      g.quadraticCurveTo(-len * 0.55, width * 0.5, 0, 0);
      g.fillStyle = '#ffffff';
      g.fill();
      g.strokeStyle = 'rgba(40,60,90,0.7)';
      g.lineWidth = unit * 0.45;
      g.stroke();
      g.restore();
    };
    feather(unit * 9, -0.55, unit * 2.4);
    feather(unit * 7.5, -0.2, unit * 2.1);
    feather(unit * 6, 0.12, unit * 1.8);
    const gradient = g.createLinearGradient(-unit * 4, 0, unit * 6, 0);
    gradient.addColorStop(0, '#5c341b');
    gradient.addColorStop(0.5, '#9c6238');
    gradient.addColorStop(1, '#6b3d20');
    g.fillStyle = gradient;
    g.beginPath();
    g.moveTo(-unit * 3.6, -unit * 12);
    g.lineTo(unit * 3.4, -unit * 12);
    g.lineTo(unit * 3.6, -unit * 3);
    g.quadraticCurveTo(unit * 9.5, -unit * 2.6, unit * 10.2, unit * 0.6);
    g.lineTo(unit * 10.4, unit * 1.8);
    g.lineTo(-unit * 4.2, unit * 1.8);
    g.quadraticCurveTo(-unit * 4.8, -unit * 4, -unit * 3.6, -unit * 12);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(20,12,8,0.85)';
    g.lineWidth = unit * 0.6;
    g.stroke();
    g.fillStyle = '#3a2417';
    g.beginPath();
    g.roundRect(-unit * 4.4, unit * 1.4, unit * 15, unit * 1.8, unit * 0.8);
    g.fill();
    const rng = makeRng(seed);
    for (let i = 0; i < 6; i++) {
      const puffX = -unit * 4.4 + i * unit * 1.65;
      g.fillStyle = i % 2 ? '#eaf4ff' : '#ffffff';
      g.beginPath();
      g.arc(puffX, -unit * 12 + (rng() - 0.5) * unit * 0.8, unit * (1.5 + rng() * 0.7), 0, TWO_PI);
      g.fill();
    }
    g.restore();
  };
  boot(px * 0.36, px * 0.72, 1, 'cs-l');
  boot(px * 0.62, px * 0.66, 1, 'cs-r');
  brushStroke(
    g,
    [
      [px * 0.08, px * 0.5],
      [px * 0.18, px * 0.46],
      [px * 0.26, px * 0.47],
    ],
    'rgba(255,255,255,1)',
    {
      width: unit * 0.9,
      seed: 'cs-w1',
      dry: 0.4,
      core: 0.5,
      alpha: 0.7,
      taperStart: 0.2,
      taperEnd: 0.5,
    },
  );
  brushStroke(
    g,
    [
      [px * 0.1, px * 0.62],
      [px * 0.2, px * 0.59],
    ],
    'rgba(255,255,255,1)',
    {
      width: unit * 0.8,
      seed: 'cs-w2',
      dry: 0.4,
      core: 0.5,
      alpha: 0.6,
      taperStart: 0.2,
      taperEnd: 0.5,
    },
  );
  const rng = makeRng('cs-spark');
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 6; i++)
    fillSparkle(g, px * (0.08 + rng() * 0.85), px * (0.06 + rng() * 0.3), unit * (0.45 + rng() * 0.8));
  return canvas;
}
