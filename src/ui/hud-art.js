/**
 * Painted HUD art: the heart curve and the layered heart sprites (back, fill, ghost, outline, splash), crack lines for broken hearts, and cached painted screen vignettes. Also the inked SVGs for the lock-on arrow and ring, the alert marks and the sparkle.
 */
import { makeRng } from '../core/math.js';
import { brushStroke, inkSplat, makeCanvas, rgba } from './brush.js';
const TAU = Math.PI * 2;
export function heartPath(cx, cy, scale, steps = 96, start = 0, sweep = 1) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = start + (i / steps) * TAU * sweep;
    const s2 = Math.sin(t);
    const x = 16 * s2 * s2 * s2;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    pts.push([cx + x * scale, cy - (y + 2.5) * scale]);
  }
  return pts;
}
function tracePath(g, pts) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
}
let heartArt = null;
export function getHeartArt(wEm = 2.5, hEm = 2.28) {
  if (heartArt) return heartArt;
  const w = wEm * 16;
  const h = hEm * 16;
  const pad = 2.6;
  const unit = Math.min((w - pad * 2) / 32, (h - pad * 2) / 29);
  const cx = w / 2;
  const cy = h / 2 + 0.3;
  const outline = heartPath(cx, cy, unit * 0.93, 120);
  makeRng('hp-art');
  const back = makeCanvas(w, h, 3);
  {
    const g = back.g;
    tracePath(g, outline);
    g.fillStyle = 'rgba(14,15,22,0.58)';
    g.fill();
    g.save();
    tracePath(g, outline);
    g.clip();
    const gradient = g.createRadialGradient(cx - unit * 5, cy - unit * 6, 0, cx, cy, unit * 20);
    gradient.addColorStop(0, 'rgba(255,240,225,0.10)');
    gradient.addColorStop(1, 'rgba(255,240,225,0)');
    g.fillStyle = gradient;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5; i++) {
      const y = cy - unit * 10 + i * unit * 5;
      brushStroke(
        g,
        [
          [cx - unit * 17, y + unit * 2],
          [cx, y - unit],
          [cx + unit * 17, y + unit * 1.5],
        ],
        'rgba(0,0,0,1)',
        {
          width: unit * 5,
          seed: `hp-well-${i}`,
          dry: 0.7,
          core: 0,
          alpha: 0.14,
          bristles: 14,
        },
      );
    }
    g.restore();
  }
  const fill = makeCanvas(w, h, 3);
  {
    const g = fill.g;
    g.save();
    tracePath(g, outline);
    g.clip();
    const gradient = g.createLinearGradient(cx - unit * 12, cy - unit * 14, cx + unit * 10, cy + unit * 16);
    gradient.addColorStop(0, '#ff8866');
    gradient.addColorStop(0.35, '#f2473f');
    gradient.addColorStop(0.75, '#cf2833');
    gradient.addColorStop(1, '#9b1a2a');
    g.fillStyle = gradient;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 7; i++) {
      const dx = (i - 3) * unit * 4.4;
      brushStroke(
        g,
        [
          [cx - unit * 18 + dx, cy + unit * 14],
          [cx + dx * 0.4, cy],
          [cx + unit * 16 + dx, cy - unit * 15],
        ],
        i % 2 ? 'rgba(255,220,200,1)' : 'rgba(90,0,20,1)',
        {
          width: unit * 6.5,
          seed: `hp-b-${i}`,
          dry: 0.65,
          core: 0,
          alpha: i % 2 ? 0.16 : 0.22,
          bristles: 18,
        },
      );
    }
    const edgeShade = g.createRadialGradient(cx + unit * 3, cy - unit * 4, unit * 9, cx, cy, unit * 21);
    edgeShade.addColorStop(0, 'rgba(60,0,15,0)');
    edgeShade.addColorStop(1, 'rgba(60,0,15,0.55)');
    g.fillStyle = edgeShade;
    g.fillRect(0, 0, w, h);
    g.save();
    g.translate(cx - unit * 8.3, cy - unit * 7.6);
    g.rotate(-0.55);
    const highlight = g.createRadialGradient(0, 0, 0, 0, 0, unit * 4.5);
    highlight.addColorStop(0, 'rgba(255,250,240,0.85)');
    highlight.addColorStop(0.5, 'rgba(255,250,240,0.35)');
    highlight.addColorStop(1, 'rgba(255,250,240,0)');
    g.scale(1.5, 0.8);
    g.fillStyle = highlight;
    g.beginPath();
    g.arc(0, 0, unit * 4.5, 0, TAU);
    g.fill();
    g.restore();
    g.fillStyle = 'rgba(255,252,246,0.9)';
    g.beginPath();
    g.ellipse(cx - unit * 9.4, cy - unit * 8.6, unit * 1.5, unit * 0.9, -0.6, 0, TAU);
    g.fill();
    g.restore();
  }
  const ghost = makeCanvas(w, h, 3);
  {
    const g = ghost.g;
    tracePath(g, outline);
    const gradient = g.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#fffaf0');
    gradient.addColorStop(1, '#f3d9c6');
    g.fillStyle = gradient;
    g.fill();
  }
  const line = makeCanvas(w, h, 3);
  {
    const g = line.g;
    const rim = heartPath(cx, cy, unit * 0.95, 120);
    g.save();
    tracePath(g, rim);
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(8,9,14,0.62)';
    g.lineWidth = unit * 3.4;
    g.stroke();
    g.restore();
    brushStroke(
      g,
      heartPath(cx, cy, unit * 0.95, 110, Math.PI - 0.1, 1.07).map(([x, y], i) => [
        x + Math.sin(i * 0.37) * unit * 0.12,
        y,
      ]),
      '#f6efdf',
      {
        width: unit * 1.9,
        seed: 'hp-line',
        dry: 0.28,
        core: 0.75,
        taperStart: 0.03,
        taperEnd: 0.08,
        wobble: 0.18,
      },
    );
  }
  const splash = makeCanvas(96, 96, 2);
  inkSplat(splash.g, 48, 48, 12.48, '#e2332f', 'hp-splash', {
    tendrils: 9,
    drops: 16,
    reach: 1.25,
    rim: true,
  });
  heartArt = {
    back: back.canvas.toDataURL(),
    fill: fill.canvas.toDataURL(),
    ghost: ghost.canvas.toDataURL(),
    line: line.canvas.toDataURL(),
    splash: splash.canvas.toDataURL(),
  };
  return heartArt;
}
export function crackPath(seed) {
  const rng = makeRng(seed);
  let x = 50 + (rng() - 0.5) * 6;
  let y = 24;
  let d2 = `M${x.toFixed(1)} ${y.toFixed(1)}`;
  const forkAt = 2 + Math.floor(rng() * 2);
  let fork = '';
  for (let i = 0; i < 6; i++) {
    x += (i % 2 ? 1 : -1) * (5 + rng() * 7);
    y += 8 + rng() * 5;
    d2 += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
    if (i === forkAt) {
      const fx = x + (rng() < 0.5 ? -1 : 1) * (10 + rng() * 6);
      fork = ` M${x.toFixed(1)} ${y.toFixed(1)} L${fx.toFixed(1)} ${(y + 6 + rng() * 5).toFixed(1)}`;
    }
  }
  return d2 + fork;
}
const vignetteCache = new Map();
export function paintedVignette(color, seed, options = {}) {
  const key = `${color}|${seed}|${options.alpha}|${options.strokes}|${options.reach}|${options.core}|${options.deep}`;
  const cached = vignetteCache.get(key);
  if (cached) return cached;
  const { canvas, g: g2 } = makeCanvas(640, 360, 1);
  const alpha = options.alpha ?? 1;
  const reach = options.reach ?? 1;
  const deep = options.deep ?? color;
  const rng = makeRng(`vig-${seed}`);
  const radius = Math.hypot(640, 360) / 2;
  const gradient = g2.createRadialGradient(320, 180, radius * (0.62 - 0.12 * reach), 320, 180, radius);
  gradient.addColorStop(0, rgba(deep, 0));
  gradient.addColorStop(0.5, rgba(deep, 0.3 * alpha * (options.core ?? 1)));
  gradient.addColorStop(1, rgba(deep, 0.95 * alpha * (options.core ?? 1)));
  g2.fillStyle = gradient;
  g2.fillRect(0, 0, 640, 360);
  const strokes = options.strokes ?? 70;
  for (let i = 0; i < strokes; i++) {
    const side = rng() < 0.62 ? (rng() < 0.5 ? 0 : 1) : rng() < 0.5 ? 2 : 3;
    const horiz = side < 2;
    const span = horiz ? 640 : 360;
    const len = span * (horiz ? 0.16 + rng() * 0.34 : 0.32 + rng() * 0.45);
    const start = rng() * (span + len * 0.5) - len * 0.4;
    const wisp = rng() < 0.25;
    const depth = (wisp ? 0.05 + rng() * 0.07 : rng() ** 2 * 0.05) * (horiz ? 360 : 640) * reach;
    const bow = (rng() - 0.5) * (wisp ? 22 : 10);
    const pts = [];
    for (let j = 0; j <= 3; j++) {
      const t = j / 3;
      const along = start + len * t;
      const inset = depth + Math.sin(t * Math.PI) * bow;
      if (side === 0) pts.push([along, inset]);
      else if (side === 1) pts.push([along, 360 - inset]);
      else if (side === 2) pts.push([inset, along]);
      else pts.push([640 - inset, along]);
    }
    brushStroke(g2, pts, rng() < 0.4 ? deep : color, {
      width: (wisp ? 6 + rng() * 14 : horiz ? 14 + rng() * 30 : 10 + rng() * 22) * reach,
      seed: `vig-${seed}-${i}`,
      dry: wisp ? 0.7 : 0.35 + rng() * 0.25,
      core: wisp ? 0.2 : 0.65,
      alpha: (wisp ? 0.3 + rng() * 0.3 : 0.55 + rng() * 0.45) * alpha,
      taperStart: 0.15,
      taperEnd: 0.3,
    });
  }
  for (const [cx, cy] of [
    [0, 0],
    [640, 0],
    [0, 360],
    [640, 360],
  ])
    inkSplat(
      g2,
      cx + (cx ? -1 : 1) * (4 + rng() * 12),
      cy + (cy ? -1 : 1) * (3 + rng() * 9),
      (26 + rng() * 20) * reach,
      rgba(deep, 0.85 * alpha),
      `vig-${seed}-c${cx}${cy}`,
      {
        tendrils: 8,
        drops: 14,
        reach: 1.2,
      },
    );
  const url = canvas.toDataURL();
  vignetteCache.set(key, url);
  return url;
}
export const LOCK_ARROW_SVG = `<svg viewBox="-20 -20 40 40"><g filter="url(#wb-rough)" stroke-linejoin="round">
  <path d="M-11.5 -9.5 Q0 -6.5 11.5 -9.5 L1.2 10.5 Q0 12 -1.2 10.5 Z" fill="rgba(8,9,14,.6)" stroke="rgba(8,9,14,.6)" stroke-width="6"/>
  <path class="lk-af" d="M-11.5 -9.5 Q0 -6.5 11.5 -9.5 L1.2 10.5 Q0 12 -1.2 10.5 Z" stroke="#fffaf0" stroke-width="2.2"/>
  <path d="M-6 -6.2 Q0 -4.9 6 -6.2 L0.6 4.6 Z" fill="rgba(255,255,255,.45)"/>
</g></svg>`;
export function lockRingSvg() {
  const pointer = (ang) => {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const rot = (x, y) => `${(c * x - s * y).toFixed(2)} ${(s * x + c * y).toFixed(2)}`;
    return `M${rot(47, -7)} L${rot(47, 7)} L${rot(35.5, 0)} Z`;
  };
  const pointers = [0, 1, 2].map((i) => pointer(-Math.PI / 2 + (i * TAU) / 3)).join(' ');
  const third = (TAU * 41) / 3;
  return `<svg viewBox="-56 -56 112 112"><g filter="url(#wb-rough)" stroke-linejoin="round" stroke-linecap="round">
    <circle r="41" fill="none" stroke="rgba(8,9,14,.5)" stroke-width="5" stroke-dasharray="${(third * 0.55).toFixed(1)} ${(third * 0.45).toFixed(1)}" stroke-dashoffset="${(-third * 0.22).toFixed(1)}"/>
    <circle class="lk-rc" r="41" fill="none" stroke-width="2" stroke-dasharray="${(third * 0.55).toFixed(1)} ${(third * 0.45).toFixed(1)}" stroke-dashoffset="${(-third * 0.22).toFixed(1)}"/>
    <path d="${pointers}" fill="rgba(8,9,14,.6)" stroke="rgba(8,9,14,.6)" stroke-width="5.5"/>
    <path class="lk-tf" d="${pointers}" stroke="#fffaf0" stroke-width="1.6"/>
  </g></svg>`;
}
export const ALERT_BANG_SVG = `<svg viewBox="-20 -34 40 68"><g filter="url(#wb-rough)" stroke-linejoin="round" stroke-linecap="round">
  <path d="M-6.8 -26 Q0 -29.5 6.8 -26 L2.6 9 Q0 11.5 -2.6 9 Z" fill="rgba(8,9,14,.7)" stroke="rgba(8,9,14,.7)" stroke-width="6.5"/>
  <circle cx="0" cy="21" r="6.2" fill="rgba(8,9,14,.7)" stroke="rgba(8,9,14,.7)" stroke-width="6.5"/>
  <path d="M-6.8 -26 Q0 -29.5 6.8 -26 L2.6 9 Q0 11.5 -2.6 9 Z" fill="#ffc53d"/>
  <circle cx="0" cy="21" r="6.2" fill="#ffc53d"/>
  <path d="M-3.4 -23.5 Q-1 -24.4 0.6 -24 L-0.6 -4" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="2.2"/>
</g></svg>`;
export const ALERT_QUESTION_SVG = `<svg viewBox="-24 -34 48 68"><g filter="url(#wb-rough)" stroke-linejoin="round" stroke-linecap="round" fill="none">
  <path d="M-11 -14 Q-11 -27 1 -27 Q13 -27 13 -16 Q13 -8 4 -3.5 Q-0.5 -1 -0.5 6" stroke="rgba(8,9,14,.62)" stroke-width="13"/>
  <circle cx="-0.5" cy="20" r="5.6" fill="rgba(8,9,14,.62)" stroke="rgba(8,9,14,.62)" stroke-width="6"/>
  <path d="M-11 -14 Q-11 -27 1 -27 Q13 -27 13 -16 Q13 -8 4 -3.5 Q-0.5 -1 -0.5 6" stroke="#e8eef2" stroke-width="6.4"/>
  <circle cx="-0.5" cy="20" r="5.6" fill="#e8eef2"/>
</g></svg>`;
export const SPARKLE_SVG =
  '<svg viewBox="-10 -10 20 20"><path d="M0 -9 Q1.1 -1.1 9 0 Q1.1 1.1 0 9 Q-1.1 1.1 -9 0 Q-1.1 -1.1 0 -9Z" fill="#fffaf0"/></svg>';
