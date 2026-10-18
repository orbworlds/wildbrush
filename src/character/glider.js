/**
 * The hero's paint-splattered glider: a canopy mesh rebuilt every frame as it unfolds, billows and flutters with speed, plus the hand bar and the rigging lines. Its canopy comes in several designs (CANOPIES).
 */
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { PALETTE } from '../core/config.js';
import { makeRng } from '../core/math.js';
import { Spring } from './anim-math.js';
import { HERO_COLORS } from './body-mesh.js';
import { patchToonMaterial } from './toon-material.js';
export const GLIDER_BAR_Y = 1.72;
export const GLIDER_GRIP_X = 0.2;
const GLIDER_SPAN_SEGS = 28;
const GLIDER_CHORD_SEGS = 7;
const GLIDER_SPAN = 3.1;
const GLIDER_CHORD = 1.15;
const GLIDER_ARC_RADIUS = 2;
const GLIDER_LINE_SPOTS = [-0.92, -0.62, -0.3, 0.3, 0.62, 0.92];
/**
 * Canopy designs (the wardrobe sells the others): the nine panels' colours from the middle one
 * outward (repeating), the middle panel and leading edge, the seams, and what's painted on it:
 * paint splats in `splats` colours, or gold and white `stars`.
 */
export const CANOPIES = {
  classic: {
    stripes: ['#d8683a', '#f3e9d2'],
    middle: '#23767a',
    edge: '#23767a',
    splats: Object.values(PALETTE).map((paint) => paint.css),
  },
  night: {
    stripes: ['#2b3a6b', '#1e2a4d'],
    middle: '#e2b450',
    edge: '#e2b450',
    seams: 'rgba(226,180,80,0.35)',
    stars: true,
  },
  prism: {
    stripes: [PALETTE.yellow.css, PALETTE.green.css, PALETTE.blue.css, PALETTE.red.css],
    middle: '#fff6e0',
    edge: '#2b2620',
    splats: ['#fffaf0'],
  },
  leaf: {
    stripes: ['#6a9a3e', '#d8eab0'],
    middle: '#2f5a27',
    edge: '#2f5a27',
    splats: ['#f4e27a', '#fffaf0', '#9fcf62'],
  },
  sunset: {
    stripes: ['#ffd27a', '#f39a4a', '#e0607e', '#8f4fb0'],
    middle: '#fff1d6',
    edge: '#4a2a5a',
    seams: 'rgba(90,40,70,0.3)',
  },
};
/** Paints a canopy design onto a canvas of any size (the texture is 512×128: span × chord). */
export function paintCanopy(g, width, height, design = CANOPIES.classic) {
  g.save();
  g.scale(width / 512, height / 128);
  for (let i = 0; i < 9; i++) {
    const x0 = (i / 9) * 512;
    const x1 = ((i + 1) / 9) * 512;
    const out = Math.abs(i - 4);
    g.fillStyle = out ? design.stripes[(out - 1) % design.stripes.length] : design.middle;
    g.fillRect(x0, 0, x1 - x0 + 1, 128);
  }
  g.fillStyle = 'rgba(40,40,40,0.18)';
  g.fillRect(0, 0, 512, 10);
  g.fillStyle = design.edge;
  g.fillRect(0, 0, 512, 7);
  g.strokeStyle = design.seams ?? 'rgba(70,45,30,0.35)';
  g.lineWidth = 2;
  for (let i = 1; i < 9; i++) {
    const x = (i / 9) * 512;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 128);
    g.stroke();
  }
  const rng = makeRng('glider-splats');
  if (design.splats) {
    const colors = design.splats;
    for (let i = 0; i < 16; i++) {
      const x = rng() * 512;
      const y = 20 + rng() * 98;
      const radius = 5 + rng() * 14;
      g.fillStyle = colors[Math.floor(rng() * colors.length)];
      g.globalAlpha = 0.9;
      g.beginPath();
      g.arc(x, y, radius, 0, Math.PI * 2);
      g.fill();
      for (let j = 0; j < 7; j++) {
        const angle = rng() * Math.PI * 2;
        const dist = radius * (0.8 + rng() * 0.9);
        g.beginPath();
        g.arc(x + Math.cos(angle) * dist, y + Math.sin(angle) * dist * 0.8, 1.5 + rng() * radius * 0.3, 0, Math.PI * 2);
        g.fill();
      }
      if (rng() > 0.5) g.fillRect(x - 2, y, 4, radius + rng() * 18);
    }
  }
  if (design.stars)
    for (let i = 0; i < 26; i++) {
      const x = rng() * 512;
      const y = 16 + rng() * 104;
      const r = 2.5 + rng() * (i < 6 ? 7 : 3.5);
      g.fillStyle = rng() < 0.6 ? '#ffe7a3' : '#fffaf0';
      g.globalAlpha = 0.95;
      g.beginPath();
      for (let k = 0; k < 8; k++) {
        const angle = (k / 8) * Math.PI * 2;
        const reach = k % 2 ? r * 0.32 : r;
        g.lineTo(x + Math.sin(angle) * reach, y - Math.cos(angle) * reach);
      }
      g.fill();
    }
  g.globalAlpha = 1;
  g.restore();
}
function makeGliderTexture(design) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  paintCanopy(canvas.getContext('2d'), 512, 128, design ?? CANOPIES.classic);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
export class Glider {
  group = new Group();
  canopy;
  geo;
  lines;
  bar;
  open = Spring.make(2.6, 0.42);
  linePos;
  t = 0;
  prevTarget = 0;
  amount = 0;
  design = null;
  constructor(ctx, design = null) {
    this.group.name = 'hero-glider';
    this.design = design;
    this.geo = new BufferGeometry();
    const positions = new Float32Array(696);
    const uvs = new Float32Array(464);
    const indices = [];
    for (let i = 0; i < 8; i++)
      for (let j = 0; j < 29; j++) {
        const vi = i * 29 + j;
        uvs[vi * 2] = j / GLIDER_SPAN_SEGS;
        uvs[vi * 2 + 1] = 1 - i / GLIDER_CHORD_SEGS;
        if (j < GLIDER_SPAN_SEGS && i < GLIDER_CHORD_SEGS) {
          const i00 = vi;
          const i01 = vi + 1;
          const i10 = vi + 29;
          const i11 = vi + 29 + 1;
          indices.push(i00, i10, i01, i01, i10, i11);
        }
      }
    this.geo.setAttribute('position', new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage));
    this.geo.setAttribute('uv', new BufferAttribute(uvs, 2));
    this.geo.setIndex(indices);
    const canopyMat = new MeshStandardMaterial({
      map: makeGliderTexture(design),
      roughness: 0.85,
      side: DoubleSide,
    });
    patchToonMaterial(canopyMat, ctx, {
      key: 'wb-glider',
      rim: 0.6,
      translucency: 0.55,
    });
    this.canopy = new Mesh(this.geo, canopyMat);
    this.canopy.castShadow = true;
    this.canopy.receiveShadow = false;
    this.canopy.frustumCulled = false;
    this.group.add(this.canopy);
    const barGeo = new CylinderGeometry(0.022, 0.022, 0.78, 10, 1);
    barGeo.rotateZ(Math.PI / 2);
    const woodMat = new MeshStandardMaterial({
      color: HERO_COLORS.wood,
      roughness: 0.7,
    });
    patchToonMaterial(woodMat, ctx, {
      key: 'wb-glider-bar',
    });
    this.bar = new Mesh(barGeo, woodMat);
    this.bar.position.set(0, GLIDER_BAR_Y, 0.05);
    this.bar.castShadow = true;
    const gripMat = new MeshStandardMaterial({
      color: HERO_COLORS.leatherDark,
      roughness: 0.8,
    });
    patchToonMaterial(gripMat, ctx, {
      key: 'wb-glider-grip',
    });
    for (const side of [-1, 1]) {
      const grip = new Mesh(new CylinderGeometry(0.028, 0.028, 0.14, 10).rotateZ(Math.PI / 2), gripMat);
      grip.position.set(side * GLIDER_GRIP_X, 0, 0);
      this.bar.add(grip);
      const cap = new Mesh(new SphereGeometry(0.032, 10, 8), woodMat);
      cap.position.set(side * 0.4, 0, 0);
      this.bar.add(cap);
    }
    this.group.add(this.bar);
    const lineCount = GLIDER_LINE_SPOTS.length * 2;
    this.linePos = new BufferAttribute(new Float32Array(lineCount * 2 * 3), 3).setUsage(DynamicDrawUsage);
    const lineGeo = new BufferGeometry();
    lineGeo.setAttribute('position', this.linePos);
    this.lines = new LineSegments(
      lineGeo,
      new LineBasicMaterial({
        color: 0x4a3226,
        transparent: true,
        opacity: 0.85,
      }),
    );
    this.lines.frustumCulled = false;
    this.group.add(this.lines);
    this.group.visible = false;
  }
  /** Another canopy (one of CANOPIES, or null for the classic). */
  setDesign(design) {
    if (design === this.design) return;
    this.design = design;
    const material = this.canopy.material;
    const old = material.map;
    material.map = makeGliderTexture(design);
    old?.dispose();
  }
  update(dt, openTarget, bank, pitch, speed) {
    if (dt <= 0) return;
    this.t += dt;
    if (openTarget < this.prevTarget) {
      this.open.stiffness = (2 * Math.PI * 4) ** 2;
      this.open.damping = 3.6 * Math.PI * 4;
    } else if (openTarget > this.prevTarget) {
      this.open.stiffness = (2 * Math.PI * 2.6) ** 2;
      this.open.damping = 1.68 * Math.PI * 2.6;
    }
    this.prevTarget = openTarget;
    const amount = this.open.step(openTarget, dt);
    this.amount = amount;
    const visible = amount > 0.015 || openTarget > 0;
    this.group.visible = visible;
    if (!visible) return;
    const unfold = Math.max(0, Math.min(1.25, amount));
    const deployed = Math.min(1, unfold);
    this.group.rotation.set(pitch * deployed, 0, bank * deployed, 'YXZ');
    _barPivot.set(0, GLIDER_BAR_Y, 0.05);
    _barPivotRot.copy(_barPivot).applyEuler(this.group.rotation);
    this.group.position.subVectors(_barPivot, _barPivotRot);
    this.bar.scale.setScalar(0.4 + 0.6 * gliderSmoothstep(0, 0.35, unfold));
    this.bar.visible = unfold > 0.05;
    const position = this.geo.attributes.position;
    const verts = position.array;
    const halfAngle = (GLIDER_SPAN / 2 / GLIDER_ARC_RADIUS) * (0.25 + 0.75 * gliderSmoothstep(0.1, 0.9, unfold));
    const spread = 0.08 + 0.92 * unfold;
    const chordScale = 0.3 + 0.7 * gliderSmoothstep(0, 0.6, unfold);
    const crownY = 1.12 + 1.83 * gliderSmoothstep(0, 0.8, unfold);
    const zOffset = -0.35 * (1 - gliderSmoothstep(0, 0.7, unfold)) + 0.1 * deployed;
    const flutter = (0.02 + Math.min(speed, 12) * 0.005) * deployed;
    const time = this.t;
    for (let i = 0; i <= GLIDER_CHORD_SEGS; i++) {
      const chordT = i / GLIDER_CHORD_SEGS;
      for (let j = 0; j <= GLIDER_SPAN_SEGS; j++) {
        const spanU = (j / GLIDER_SPAN_SEGS) * 2 - 1;
        const angle = spanU * halfAngle;
        let px = Math.sin(angle) * GLIDER_ARC_RADIUS * spread;
        let py = crownY + (Math.cos(angle) - 1) * GLIDER_ARC_RADIUS * (0.4 + 0.6 * deployed);
        const billow = Math.sin(Math.PI * chordT ** 0.7) * 0.1 * deployed;
        const scallop = Math.abs(Math.sin(spanU * Math.PI * 4.5)) * 0.03 * deployed * (1 - chordT * 0.6);
        py += billow + scallop;
        let pz = zOffset + (0.45 - chordT) * GLIDER_CHORD * chordScale;
        const ripple =
          Math.sin(time * 13 + spanU * 5 + chordT * 2) * flutter * chordT * chordT +
          Math.sin(time * 7.3 + spanU * 9) * flutter * 0.4 * chordT;
        py += ripple;
        const slack = (1 - deployed) * 0.12;
        px += Math.sin(spanU * 17 + chordT * 5) * slack * 0.3;
        py += Math.sin(spanU * 11 + chordT * 7) * slack;
        py -= Math.abs(spanU) ** 3 * 0.12 * deployed;
        pz += Math.abs(spanU) ** 2 * 0.06 * deployed;
        const vi = (i * 29 + j) * 3;
        verts[vi] = px;
        verts[vi + 1] = py;
        verts[vi + 2] = pz;
      }
    }
    position.needsUpdate = true;
    this.geo.computeVertexNormals();
    const lineVerts = this.linePos.array;
    let ptr = 0;
    for (const spot of GLIDER_LINE_SPOTS) {
      const side = spot > 0 ? 1 : -1;
      const col = Math.round(((spot + 1) / 2) * GLIDER_SPAN_SEGS);
      for (const row of [1, 6]) {
        const vi = (row * 29 + col) * 3;
        lineVerts[ptr++] = side * 0.37 * this.bar.scale.x;
        lineVerts[ptr++] = GLIDER_BAR_Y;
        lineVerts[ptr++] = 0.05;
        lineVerts[ptr++] = verts[vi];
        lineVerts[ptr++] = verts[vi + 1];
        lineVerts[ptr++] = verts[vi + 2];
      }
    }
    this.linePos.needsUpdate = true;
    this.lines.visible = unfold > 0.3;
  }
}
const _barPivot = new Vector3();
const _barPivotRot = new Vector3();
function gliderSmoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
