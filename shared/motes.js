/**
 * Ambient motes: drifting pollen, blinking fireflies and rising embers scattered over areas as one additive point cloud animated in the vertex shader.
 */
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  MathUtils,
  Points,
  ShaderMaterial,
} from 'three';
const MOTE_VERTEX = `
#include <wb_common>
attribute vec4 aSeed;   // x,y,z random, w kind
attribute vec3 aColor;
attribute float aSize;
uniform float uScale;
uniform float uIntensity;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float s = aSeed.x * 6.283;
  float kind = aSeed.w;
  vec3 p = position;
  float t = uTime;
  if (kind < 0.5) {
    p += vec3(sin(t * 0.7 + s) * 0.6, sin(t * 0.9 + s * 1.3) * 0.35, cos(t * 0.6 + s * 0.7) * 0.6);
  } else if (kind < 1.5) {
    p += vec3(sin(t * 0.43 + s) * 1.4 + sin(t * 1.3 + s * 2.0) * 0.3, sin(t * 0.6 + s * 1.7) * 0.7, cos(t * 0.37 + s * 0.9) * 1.4);
  } else {
    float cyc = fract(t * 0.08 * (0.6 + aSeed.y) + aSeed.z);
    p += vec3(sin(t * 0.5 + s) * 0.8, cyc * 5.0, cos(t * 0.45 + s) * 0.8);
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float blink = kind > 0.5 && kind < 1.5 ? smoothstep(0.2, 0.9, sin(t * (1.1 + aSeed.y) + s * 3.0)) : 0.65 + 0.35 * sin(t * 2.0 + s * 5.0);
  if (kind > 1.5) { float cyc = fract(t * 0.08 * (0.6 + aSeed.y) + aSeed.z); blink *= sin(cyc * 3.14159); }
  float dist = -mv.z;
  vAlpha = blink * smoothstep(90.0, 30.0, dist) * uIntensity;
  vColor = aColor;
  gl_PointSize = min(aSize * uScale / max(0.1, dist), 64.0);
}
`;
const MOTE_FRAGMENT = `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float a = (1.0 - d);
  a = a * a + smoothstep(0.3, 0.0, d);
  gl_FragColor = vec4(vColor * a * vAlpha, 1.0);
}
`;
export class Motes {
  points;
  uniforms;
  constructor(ctx, defs, rand, density = 1) {
    const positions = [];
    const seeds = [];
    const colors = [];
    const sizes = [];
    const color = new Color();
    for (const def of defs) {
      const count = Math.max(1, Math.round(def.count * density));
      color.set(def.color);
      for (let i = 0; i < count; i++) {
        const angle = rand() * Math.PI * 2;
        const dist = Math.sqrt(rand()) * def.radius;
        const px = def.x + Math.cos(angle) * dist;
        const pz = def.z + Math.sin(angle) * dist;
        let py = def.y + rand() * def.height;
        if (def.ground)
          try {
            py = Math.max(ctx.terrain.heightAt(px, pz), ctx.water?.level ?? 0) + 0.3 + rand() * def.height;
          } catch {}
        positions.push(px, py, pz);
        seeds.push(rand(), rand(), rand(), def.kind);
        colors.push(color.r, color.g, color.b);
        sizes.push(def.size * (0.6 + rand() * 0.8));
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new Float32BufferAttribute(seeds, 4));
    geometry.setAttribute('aColor', new Float32BufferAttribute(colors, 3));
    geometry.setAttribute('aSize', new Float32BufferAttribute(sizes, 1));
    this.uniforms = {
      ...ctx.globals,
      uScale: {
        value: 400,
      },
      uIntensity: {
        value: 1,
      },
    };
    const material = new ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: MOTE_VERTEX,
      fragmentShader: MOTE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.points = new Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 9;
    this.points.name = 'content-motes';
    ctx.scene.add(this.points);
  }
  update(ctx) {
    this.uniforms.uScale.value =
      ctx.renderer.domElement.height / (2 * Math.tan(MathUtils.degToRad(ctx.camera.fov) / 2));
  }
}
