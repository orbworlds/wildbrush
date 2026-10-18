/**
 * Canvas brush kit behind the painterly UI: bristle brush strokes along a smoothed path, ink splats with tendrils and drops, brush rings, watercolour washes, paper grain and rough paper cards. Also the stroke, splat, ring and wash canvases the widgets are built from, and hex colour helpers.
 */
import { makeNoise2D, makeRng } from '../core/math.js';
export function makeCanvas(w, h, scale = 2) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(w * scale));
  canvas.height = Math.max(1, Math.ceil(h * scale));
  const g = canvas.getContext('2d');
  g.scale(scale, scale);
  return {
    canvas,
    g,
    w,
    h,
  };
}
const smoothstep = (edge0, edge1, x) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};
function samplePath(points, spacing) {
  const curve = [];
  const at = (i) => points[Math.min(points.length - 1, Math.max(0, i))];
  if (points.length === 1) curve.push(points[0]);
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    for (let j = 0; j < 24; j++) {
      const t2 = j / 24;
      const t2_2 = t2 * t2;
      const t3 = t2_2 * t2;
      curve.push([
        0.5 *
          (2 * p1[0] +
            (-p0[0] + p2[0]) * t2 +
            (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2_2 +
            (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 *
          (2 * p1[1] +
            (-p0[1] + p2[1]) * t2 +
            (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2_2 +
            (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  curve.push(points[points.length - 1]);
  const lengths = [0];
  for (let i = 1; i < curve.length; i++)
    lengths.push(lengths[i - 1] + Math.hypot(curve[i][0] - curve[i - 1][0], curve[i][1] - curve[i - 1][1]));
  const total = lengths[lengths.length - 1] || 1;
  const count = Math.max(2, Math.ceil(total / spacing) + 1);
  const out = {
    x: new Float32Array(count),
    y: new Float32Array(count),
    nx: new Float32Array(count),
    ny: new Float32Array(count),
    t: new Float32Array(count),
    n: count,
    len: total,
  };
  let seg = 0;
  for (let i = 0; i < count; i++) {
    const along = (i / (count - 1)) * total;
    for (; seg < lengths.length - 2 && lengths[seg + 1] < along;) seg++;
    const segLen = lengths[seg + 1] - lengths[seg] || 1;
    const frac = (along - lengths[seg]) / segLen;
    out.x[i] = curve[seg][0] + (curve[seg + 1][0] - curve[seg][0]) * frac;
    out.y[i] = curve[seg][1] + (curve[seg + 1][1] - curve[seg][1]) * frac;
    out.t[i] = i / (count - 1);
  }
  for (let i = 0; i < count; i++) {
    const prev = Math.max(0, i - 1);
    const next = Math.min(count - 1, i + 1);
    const dx = out.x[next] - out.x[prev];
    const dy = out.y[next] - out.y[prev];
    const len = Math.hypot(dx, dy) || 1;
    out.nx[i] = -dy / len;
    out.ny[i] = dx / len;
  }
  return out;
}
export function brushStroke(g2, points, color, options) {
  const seed = options.seed ?? 'stroke';
  const rng = makeRng(seed);
  const noise2D = makeNoise2D(`${seed}-n`);
  const width = options.width;
  const half = width / 2;
  const path = samplePath(points, Math.max(0.6, width / 30));
  const taperStart = options.taperStart ?? 0.12;
  const taperEnd = options.taperEnd ?? 0.28;
  const wobble = options.wobble ?? 0.12;
  const dry = options.dry ?? 0.35;
  const profile = (t2, edge = 0) =>
    smoothstep(0, taperStart, t2) ** 0.55 *
    (1 - smoothstep(1 - taperEnd, 1.001, t2)) ** (0.7 + edge * 0.4) *
    (1 + wobble * noise2D(t2 * 3.1, 7.7));
  g2.save();
  g2.globalAlpha = options.alpha ?? 1;
  g2.fillStyle = color;
  g2.strokeStyle = color;
  g2.lineCap = 'round';
  g2.lineJoin = 'round';
  const core = options.core ?? 0.55;
  if (core > 0) {
    g2.save();
    g2.globalAlpha *= core;
    g2.beginPath();
    for (let i = 0; i < path.n; i++) {
      const w = profile(path.t[i]) * half * 0.82;
      const jitter = noise2D(path.t[i] * 14, 1.3) * 0.08 * half;
      if (i === 0) g2.moveTo(path.x[i] + path.nx[i] * (w + jitter), path.y[i] + path.ny[i] * (w + jitter));
      else g2.lineTo(path.x[i] + path.nx[i] * (w + jitter), path.y[i] + path.ny[i] * (w + jitter));
    }
    for (let i = path.n - 1; i >= 0; i--) {
      const w = profile(path.t[i]) * half * 0.82;
      const jitter = noise2D(path.t[i] * 14, 9.1) * 0.08 * half;
      g2.lineTo(path.x[i] - path.nx[i] * (w + jitter), path.y[i] - path.ny[i] * (w + jitter));
    }
    g2.closePath();
    g2.fill();
    g2.restore();
  }
  const bristles = options.bristles ?? Math.round(Math.min(90, Math.max(14, width * 1.4)));
  const baseAlpha = g2.globalAlpha;
  for (let j = 0; j < bristles; j++) {
    const across = ((j + rng() * 0.9) / bristles) * 2 - 1;
    const edge = Math.abs(across);
    const thickness = (width / bristles) * (1.1 + rng() * 2.2);
    const start = rng() * taperStart * 0.6;
    const end = 1 - rng() * taperEnd * (0.3 + edge * 0.9);
    const dryness = dry * (0.2 + edge * 0.9);
    g2.globalAlpha = baseAlpha * (0.35 + rng() * 0.6);
    g2.lineWidth = thickness;
    g2.beginPath();
    let drawing = false;
    const freq = 0.012 + rng() * 0.02;
    for (let k = 0; k < path.n; k++) {
      const t2 = path.t[k];
      if (t2 < start || t2 > end) {
        drawing = false;
        continue;
      }
      if (noise2D(k * freq * 6 + j * 3.7, j * 1.3) * 0.5 + 0.5 < dryness * (0.35 + t2 * 0.9)) {
        drawing = false;
        continue;
      }
      const off = across * half * profile(t2, edge);
      const px = path.x[k] + path.nx[k] * off;
      const py = path.y[k] + path.ny[k] * off;
      if (drawing) g2.lineTo(px, py);
      else {
        g2.moveTo(px, py);
        drawing = true;
      }
    }
    g2.stroke();
  }
  g2.restore();
}
export function tint(g, fill, w, h) {
  g.save();
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = fill;
  g.fillRect(0, 0, w, h);
  g.restore();
}
export function inkSplat(g2, cx, cy, radius, color, seed, options = {}) {
  const rng = makeRng(seed);
  const noise2D = makeNoise2D(`${seed}-s`);
  const tendrils = options.tendrils ?? 7;
  const reach = options.reach ?? 1;
  const rough = options.rough ?? 1;
  const tau = Math.PI * 2;
  const lobes = [];
  const lobeCount = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < lobeCount; i++)
    lobes.push({
      a: rng() * tau,
      s: (0.12 + rng() * 0.22) * rough,
      w: 0.35 + rng() * 0.4,
    });
  const angleDiff = (a, b) => {
    let d = a - b;
    for (; d > Math.PI;) d -= tau;
    for (; d < -Math.PI;) d += tau;
    return d;
  };
  const outline = [];
  for (let i = 0; i < 120; i++) {
    const ang = (i / 120) * tau;
    let k =
      0.78 +
      0.13 * rough * noise2D(Math.cos(ang) * 1.2, Math.sin(ang) * 1.2) +
      0.045 * rough * noise2D(Math.cos(ang) * 4.5, Math.sin(ang) * 4.5);
    for (const lobe of lobes) k += lobe.s * Math.exp(-((angleDiff(ang, lobe.a) / lobe.w) ** 2));
    outline.push([cx + Math.cos(ang) * radius * k, cy + Math.sin(ang) * radius * k]);
  }
  const traceOutline = () => {
    g2.beginPath();
    for (let i = 0; i <= 120; i++) {
      const p = outline[i % 120];
      const q = outline[(i + 1) % 120];
      const mx = (p[0] + q[0]) / 2;
      const my = (p[1] + q[1]) / 2;
      if (i === 0) g2.moveTo(mx, my);
      else g2.quadraticCurveTo(p[0], p[1], mx, my);
    }
    g2.closePath();
  };
  g2.save();
  g2.fillStyle = color;
  for (let i = 0; i < tendrils; i++) {
    const ang = (i / tendrils) * tau + (rng() - 0.5) * (tau / tendrils) * 0.9;
    const len = radius * (0.25 + rng() ** 1.3 * 0.95) * reach;
    const w = radius * (0.07 + rng() * 0.13);
    const base = radius * 0.62;
    const tip = radius * 0.8 + len;
    const bend = (rng() - 0.5) * 0.18;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const cb = Math.cos(ang + bend);
    const sb = Math.sin(ang + bend);
    const tx = cx + cb * tip;
    const ty = cy + sb * tip;
    const mx = cx + ca * (base + tip) * 0.55;
    const my = cy + sa * (base + tip) * 0.55;
    g2.beginPath();
    g2.moveTo(cx + ca * base - sa * w, cy + sa * base + ca * w);
    g2.quadraticCurveTo(mx - sa * w * 0.35, my + ca * w * 0.35, tx, ty);
    g2.quadraticCurveTo(mx + sa * w * 0.35, my - ca * w * 0.35, cx + ca * base + sa * w, cy + sa * base - ca * w);
    g2.closePath();
    g2.fill();
    g2.beginPath();
    g2.arc(tx, ty, w * 0.28, 0, tau);
    g2.fill();
    if (rng() < 0.65) {
      const dist = tip + radius * (0.08 + rng() * 0.22) * reach;
      const dotR = radius * (0.035 + rng() * 0.075);
      g2.beginPath();
      g2.ellipse(cx + cb * dist, cy + sb * dist, dotR * (1.2 + rng() * 0.6), dotR, ang + bend, 0, tau);
      g2.fill();
    }
  }
  traceOutline();
  g2.fill();
  if (options.rim) {
    g2.save();
    traceOutline();
    g2.clip();
    g2.globalAlpha = 0.2;
    g2.strokeStyle = 'rgba(0,0,0,0.9)';
    g2.lineWidth = radius * 0.09;
    g2.stroke();
    const gradient = g2.createRadialGradient(cx - radius * 0.25, cy - radius * 0.3, 0, cx, cy, radius * 1.1);
    gradient.addColorStop(0, 'rgba(255,255,255,0.32)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    g2.globalAlpha = 1;
    g2.fillStyle = gradient;
    g2.fillRect(cx - radius * 2, cy - radius * 2, radius * 4, radius * 4);
    g2.restore();
  }
  const drops = options.drops ?? 14;
  for (let i = 0; i < drops; i++) {
    const ang = rng() * tau;
    const far = rng() ** 0.8;
    const dist = radius * (1.05 + far * 1.05 * reach);
    const size = radius * (0.012 + 0.06 * rng() ** 2.2 * (1.15 - far));
    if (!(size <= 0.25)) {
      g2.globalAlpha = 0.8 + rng() * 0.2;
      g2.beginPath();
      g2.ellipse(cx + Math.cos(ang) * dist, cy + Math.sin(ang) * dist, size * (1 + rng() * 0.9), size, ang, 0, tau);
      g2.fill();
    }
  }
  g2.restore();
}
export function brushRing(g, cx, cy, radius, width, color, seed, options = {}) {
  const sweep = options.sweep ?? Math.PI * 2.12;
  const start = options.start ?? -Math.PI * 0.6;
  const noise2D = makeNoise2D(`${seed}-r`);
  const pts = [];
  for (let i = 0; i <= 48; i++) {
    const ang = start + (i / 48) * sweep;
    const rad = radius * (1 + 0.025 * noise2D(i * 0.2, 3.3)) - (i / 48) * width * 0.25;
    pts.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad]);
  }
  brushStroke(g, pts, color, {
    width,
    seed,
    taperStart: 0.06,
    taperEnd: 0.18,
    dry: 0.3,
    core: 0.6,
    ...options,
  });
}
function deformPolygon(poly, rng, depth) {
  let pts = poly;
  for (let i = 0; i < depth; i++) {
    const next = [];
    for (let j = 0; j < pts.length; j++) {
      const p = pts[j];
      const q = pts[(j + 1) % pts.length];
      next.push(p);
      const dist = Math.hypot(q.x - p.x, q.y - p.y);
      const gauss = (rng() + rng() + rng() - 1.5) / 1.5;
      const ang = Math.atan2(q.y - p.y, q.x - p.x) + Math.PI / 2 + gauss * 0.9;
      const amp = dist * p.v * (0.25 + rng() * 0.35);
      const v = Math.max(0.1, p.v * (0.7 + rng() * 0.5));
      next.push({
        x: (p.x + q.x) / 2 + Math.cos(ang) * amp * (rng() - 0.25),
        y: (p.y + q.y) / 2 + Math.sin(ang) * amp * (rng() - 0.25),
        v,
      });
    }
    pts = next;
  }
  return pts;
}
function watercolor(g, cx, cy, rx, ry, color, seed, layers = 22, alpha = 0.05) {
  const rng = makeRng(seed);
  const base = [];
  for (let i = 0; i < 11; i++) {
    const ang = (i / 11) * Math.PI * 2;
    base.push({
      x: cx + Math.cos(ang) * rx * (0.8 + rng() * 0.25),
      y: cy + Math.sin(ang) * ry * (0.8 + rng() * 0.25),
      v: 0.6 + rng() * 0.6,
    });
  }
  const shape = deformPolygon(base, rng, 2);
  g.save();
  g.fillStyle = color;
  g.globalAlpha = alpha;
  for (let i = 0; i < layers; i++) {
    const layer = deformPolygon(shape, rng, 3);
    g.beginPath();
    g.moveTo(layer[0].x, layer[0].y);
    for (let j = 1; j < layer.length; j++) g.lineTo(layer[j].x, layer[j].y);
    g.closePath();
    g.fill();
  }
  g.restore();
}
export function paperGrain(size = 180, seed = 'grain', strength = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  const imageData = g.createImageData(size, size);
  const rng = makeRng(seed);
  const noise2D = makeNoise2D(seed);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const v = (rng() - 0.5) * 1.6 + noise2D(x * 0.09, y * 0.09) * 0.35;
      const tone = v > 0 ? 255 : 0;
      imageData.data[idx] = imageData.data[idx + 1] = imageData.data[idx + 2] = tone;
      imageData.data[idx + 3] = Math.min(255, Math.abs(v) * 90 * strength);
    }
  g.putImageData(imageData, 0, 0);
  g.lineCap = 'round';
  for (let i = 0; i < 22; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const ang = rng() * Math.PI;
    const len = 4 + rng() * 14;
    g.strokeStyle = rng() < 0.5 ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.22)';
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(
      x + Math.cos(ang) * len * 0.5 + (rng() - 0.5) * 3,
      y + Math.sin(ang) * len * 0.5,
      x + Math.cos(ang) * len,
      y + Math.sin(ang) * len,
    );
    g.stroke();
  }
  return canvas.toDataURL();
}
export function paperCard(w, h, seed, accents) {
  const { canvas, g } = makeCanvas(w, h);
  const rng = makeRng(seed);
  const noise2D = makeNoise2D(`${seed}-edge`);
  const edge = [];
  const roughEdge = (x0, y0, x1, y1, phase) => {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 3);
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      const off =
        noise2D(x * 0.02 + phase, y * 0.02) * 4 + noise2D(x * 0.2, y * 0.2 + phase) * 1.6 + (rng() - 0.5) * 0.9;
      const nx = -(y1 - y0);
      const ny = x1 - x0;
      const len = Math.hypot(nx, ny);
      edge.push([x + (nx / len) * off, y + (ny / len) * off]);
    }
  };
  roughEdge(10, 10, w - 10, 10, 0);
  roughEdge(w - 10, 10, w - 10, h - 10, 10);
  roughEdge(w - 10, h - 10, 10, h - 10, 20);
  roughEdge(10, h - 10, 10, 10, 30);
  const trace = () => {
    g.beginPath();
    g.moveTo(edge[0][0], edge[0][1]);
    for (const p of edge) g.lineTo(p[0], p[1]);
    g.closePath();
  };
  g.save();
  g.shadowColor = 'rgba(10,10,20,0.45)';
  g.shadowBlur = 18;
  g.shadowOffsetY = 6;
  trace();
  g.fillStyle = '#efe6d1';
  g.fill();
  g.restore();
  g.save();
  trace();
  g.clip();
  const gradient = g.createLinearGradient(0, 0, w, h);
  gradient.addColorStop(0, '#f4ecda');
  gradient.addColorStop(1, '#e9dcc0');
  g.fillStyle = gradient;
  g.fillRect(0, 0, w, h);
  watercolor(g, w * 0.3, h * 0.28, w * 0.34, h * 0.26, '#e3cfa6', `${seed}-w1`, 14, 0.028);
  watercolor(g, w * 0.72, h * 0.78, w * 0.34, h * 0.28, '#dcc59b', `${seed}-w2`, 14, 0.03);
  accents.forEach((color, i) => {
    const x = i % 2 ? w * (0.9 + rng() * 0.04) : w * (0.06 + rng() * 0.04);
    const y = i < 2 ? h * (0.07 + rng() * 0.04) : h * (0.92 + rng() * 0.03);
    watercolor(g, x, y, w * 0.075, w * 0.06, color, `${seed}-a${i}`, 10, 0.03);
  });
  for (let i = 0; i < (w * h) / 900; i++) {
    g.fillStyle = rng() < 0.5 ? 'rgba(120,95,60,0.10)' : 'rgba(255,255,255,0.35)';
    g.fillRect(rng() * w, rng() * h, 0.8 + rng(), 0.8 + rng());
  }
  g.lineWidth = 7;
  g.strokeStyle = 'rgba(150,118,70,0.18)';
  trace();
  g.stroke();
  g.restore();
  return canvas;
}
export function strokeCanvas(wEm, hEm, color, seed, options = {}) {
  const w = wEm * 16;
  const h = hEm * 16;
  const { canvas, g } = makeCanvas(w, h);
  const pts = (
    options.pts ?? [
      [0.05, 0.56],
      [0.3, 0.47],
      [0.62, 0.5],
      [0.95, 0.44],
    ]
  ).map(([x, y]) => [x * w, y * h]);
  const width = (options.widthFrac ?? 0.62) * h;
  brushStroke(g, pts, color, {
    width,
    seed,
    ...options,
  });
  if (options.streak)
    brushStroke(g, pts, 'rgba(0,0,0,0.9)', {
      width: width * 0.9,
      seed: `${seed}-k`,
      core: 0,
      dry: 0.75,
      alpha: options.streak,
      bristles: 22,
    });
  if (options.sheen)
    brushStroke(g, pts, 'rgba(255,255,255,1)', {
      width: width * 0.7,
      seed: `${seed}-h`,
      core: 0,
      dry: 0.8,
      alpha: options.sheen,
      bristles: 16,
    });
  return canvas;
}
export function splatCanvas(sizeEm, color, seed, options = {}) {
  const size = sizeEm * 16;
  const { canvas, g } = makeCanvas(size, size);
  inkSplat(g, size / 2, size / 2, size * (options.rFrac ?? 0.27), color, seed, options);
  return canvas;
}
export function ringCanvas(sizeEm, color, seed, widthFrac = 0.06, options = {}) {
  const size = sizeEm * 16;
  const { canvas, g } = makeCanvas(size, size);
  brushRing(g, size / 2, size / 2, size * (options.rFrac ?? 0.42), size * widthFrac, color, seed, options);
  return canvas;
}
export function washCanvas(wEm, hEm, seed, alpha = 0.55, color = '#0d0e13') {
  const w = wEm * 16;
  const h = hEm * 16;
  const { canvas, g } = makeCanvas(w, h, 1);
  const gradient = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) / 2);
  gradient.addColorStop(0, rgba(color, alpha));
  gradient.addColorStop(0.45, rgba(color, alpha * 0.75));
  gradient.addColorStop(1, rgba(color, 0));
  g.save();
  g.translate(w / 2, h / 2);
  g.scale(1, h / w);
  g.translate(-w / 2, -h / 2);
  g.fillStyle = gradient;
  g.fillRect(0, (h - w) / 2 - w, w, w * 3);
  g.restore();
  return canvas;
}
export function rgba(hex, alpha) {
  const int = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(int >> 16) & 255},${(int >> 8) & 255},${int & 255},${alpha})`;
}
export function shade(hex, amount) {
  const int = parseInt(hex.replace('#', ''), 16);
  const mix = (c) => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
  const r = mix((int >> 16) & 255);
  const g = mix((int >> 8) & 255);
  const b = mix(int & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
