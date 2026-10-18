/**
 * Temple glyphs: the rune atlas drawn on a canvas (flame, snowflake, key, ring, drop, sun, mask and random runes) and the decal material that lights each glyph by its channel.
 */
import { CanvasTexture, DoubleSide, ShaderMaterial, SRGBColorSpace } from 'three';
import { randRange, rng } from '../shared/util.js';
export const GLYPH = {
  flame: 0,
  snow: 1,
  key: 2,
  ring: 3,
  drop: 4,
  sun: 5,
  mask: 6,
};
function makeGlyphAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const rand = rng('temple-glyphs');
  const cell = (index, draw) => {
    g.save();
    g.translate((index % 4) * 128 + 64, Math.floor(index / 4) * 128 + 64);
    draw(46.08);
    g.restore();
  };
  cell(0, (s) => {
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(0, s * 1.05);
    g.bezierCurveTo(s * 0.95, s * 0.8, s * 0.9, -s * 0.2, s * 0.15, -s * 1.05);
    g.bezierCurveTo(s * 0.3, -s * 0.35, -s * 0.2, -s * 0.2, -s * 0.35, -s * 0.6);
    g.bezierCurveTo(-s * 1, 0, -s * 0.9, s * 0.85, 0, s * 1.05);
    g.stroke();
    g.beginPath();
    g.moveTo(0, s * 0.75);
    g.bezierCurveTo(s * 0.45, s * 0.55, s * 0.35, 0, 0, -s * 0.2);
    g.bezierCurveTo(-s * 0.35, s * 0.2, -s * 0.4, s * 0.6, 0, s * 0.75);
    g.fill();
  });
  cell(1, (s) => {
    g.lineWidth = 8;
    for (let i = 0; i < 6; i++) {
      g.save();
      g.rotate((i / 6) * Math.PI * 2);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, -s * 1.05);
      g.moveTo(0, -s * 0.55);
      g.lineTo(s * 0.3, -s * 0.8);
      g.moveTo(0, -s * 0.55);
      g.lineTo(-s * 0.3, -s * 0.8);
      g.stroke();
      g.restore();
    }
    g.beginPath();
    g.arc(0, 0, s * 0.18, 0, Math.PI * 2);
    g.fill();
  });
  cell(2, (s) => {
    g.lineWidth = 10;
    g.beginPath();
    g.arc(0, -s * 0.55, s * 0.38, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(0, -s * 0.17);
    g.lineTo(0, s * 1);
    g.moveTo(0, s * 0.55);
    g.lineTo(s * 0.35, s * 0.55);
    g.moveTo(0, s * 0.85);
    g.lineTo(s * 0.28, s * 0.85);
    g.stroke();
  });
  cell(3, (s) => {
    g.lineWidth = 8;
    g.beginPath();
    g.arc(0, 0, s * 0.95, 0, Math.PI * 2);
    g.stroke();
    for (let i = 0; i < 4; i++) {
      g.save();
      g.rotate((i / 4) * Math.PI * 2 + Math.PI / 4);
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(s * 0.35, -s * 0.35, 0, -s * 0.75);
      g.quadraticCurveTo(-s * 0.35, -s * 0.35, 0, 0);
      g.fill();
      g.restore();
    }
  });
  cell(4, (s) => {
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(0, -s);
    g.bezierCurveTo(s * 0.8, -s * 0.1, s * 0.6, s * 0.9, 0, s * 0.9);
    g.bezierCurveTo(-s * 0.6, s * 0.9, -s * 0.8, -s * 0.1, 0, -s);
    g.stroke();
    g.beginPath();
    g.arc(-s * 0.18, s * 0.35, s * 0.14, 0, Math.PI * 2);
    g.fill();
  });
  cell(5, (s) => {
    g.lineWidth = 8;
    g.beginPath();
    g.arc(0, 0, s * 0.45, 0, Math.PI * 2);
    g.stroke();
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      g.beginPath();
      g.moveTo(Math.cos(ang) * s * 0.65, Math.sin(ang) * s * 0.65);
      g.lineTo(Math.cos(ang) * s * 1, Math.sin(ang) * s * 1);
      g.stroke();
    }
  });
  cell(6, (s) => {
    g.lineWidth = 8;
    g.beginPath();
    g.ellipse(0, 0, s * 0.75, s * 0.95, 0, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.ellipse(-s * 0.3, -s * 0.15, s * 0.15, s * 0.1, 0, 0, Math.PI * 2);
    g.ellipse(s * 0.3, -s * 0.15, s * 0.15, s * 0.1, 0, 0, Math.PI * 2);
    g.fill();
  });
  cell(14, (s) => {
    g.beginPath();
    for (let i = 0; i <= 64; i++) {
      const ang = (i / 64) * Math.PI * 2;
      const rad = s * (0.72 + 0.16 * Math.sin(ang * 5 + 1) + 0.1 * Math.sin(ang * 9 + 2) + 0.06 * Math.sin(ang * 13));
      const x = Math.cos(ang) * rad;
      const y = Math.sin(ang) * rad;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.fill();
    for (let i = 0; i < 7; i++) {
      const ang = rand() * Math.PI * 2;
      const dist = s * randRange(rand, 1, 1.35);
      g.beginPath();
      g.arc(Math.cos(ang) * dist, Math.sin(ang) * dist, randRange(rand, 3, 9), 0, Math.PI * 2);
      g.fill();
    }
  });
  for (let i = 7; i < 14; i++)
    cell(i, (s) => {
      g.lineWidth = randRange(rand, 7, 10);
      const strokes = 2 + Math.floor(rand() * 2);
      for (let i = 0; i < strokes; i++) {
        g.beginPath();
        const shape = Math.floor(rand() * 5);
        if (shape === 0)
          g.arc(0, 0, s * randRange(rand, 0.5, 0.95), rand() * 6.28, rand() * 6.28 + randRange(rand, 2.5, 5.5));
        else if (shape === 1) {
          g.moveTo(randRange(rand, -0.3, 0.3) * s, -s);
          g.quadraticCurveTo(randRange(rand, -0.7, 0.7) * s, 0, randRange(rand, -0.3, 0.3) * s, s * 0.7);
        } else if (shape === 2)
          for (let j = 0; j < 3; j++) {
            const y = (j - 1) * s * 0.5;
            const half = randRange(rand, 0.3, 0.9) * s;
            g.moveTo(-half, y);
            g.lineTo(half, y);
          }
        else if (shape === 3) {
          g.moveTo(0, -s * 0.9);
          g.lineTo(s * 0.8, s * 0.6);
          g.lineTo(-s * 0.8, s * 0.6);
          g.closePath();
        } else
          for (let j = 0; j <= 24; j++) {
            const x = (j / 24 - 0.5) * 2 * s;
            const y = Math.sin((j / 24) * 6.28 * randRange(rand, 1, 1.4)) * s * 0.3;
            if (j === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
          }
        g.stroke();
      }
    });
  g.fillRect(384, 387, 128, 122);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
const GLYPH_VERTEX = `
attribute vec3 color;
attribute vec2 aGl;
varying vec2 vUv;
varying vec3 vCol;
varying float vGlow;
varying vec3 vW;
uniform float uGChan[16];
void main() {
  vUv = uv;
  vCol = color;
  int ch = int(aGl.x + 0.5);
  float g = 0.0;
  for (int i = 0; i < 16; i++) { if (i == ch) g = uGChan[i]; }
  vGlow = aGl.y * g;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const GLYPH_FRAGMENT = `
#include <wb_common>
uniform sampler2D uMap;
varying vec2 vUv;
varying vec3 vCol;
varying float vGlow;
varying vec3 vW;
void main() {
  float a = texture2D(uMap, vUv).a;
  if (a < 0.45) discard;
  float sh = 0.85 + 0.15 * sin(uTime * 2.3 + vW.x * 0.8 + vW.z * 0.6 + vW.y);
  vec3 dim = vCol * 0.16 + vec3(0.03) * smoothstep(0.05, 0.3, max(vCol.r, max(vCol.g, vCol.b)));
  vec3 c = mix(dim, vCol * (1.0 + vGlow * 2.2) * sh, clamp(vGlow, 0.0, 1.0));
  gl_FragColor = vec4(c, 1.0);
}
`;
export function makeGlyphMaterial(ctx, chan, map) {
  return new ShaderMaterial({
    name: 'temple-glyph',
    uniforms: {
      ...ctx.globals,
      uMap: {
        value: map,
      },
      uGChan: {
        value: chan,
      },
    },
    vertexShader: GLYPH_VERTEX,
    fragmentShader: GLYPH_FRAGMENT,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}
let _glyphAtlas = null;
export function glyphAtlas() {
  _glyphAtlas ||= makeGlyphAtlas();
  return _glyphAtlas;
}
