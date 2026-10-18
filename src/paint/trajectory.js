/**
 * Throw preview: glowing beads flowing along the predicted blob arc and a pulsing ring of dashes where the blob will land.
 */
import {
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three';
const MAX_DOTS = 72;
const DOT_SPACING = 0.62;
const DOT_VERTEX = `
attribute vec4 aDot; // x fade, y core, zw unused
varying vec3 vN;
varying vec3 vWP;
varying vec4 vDot;
void main() {
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
  vWP = wp.xyz;
  vDot = aDot;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const DOT_FRAGMENT = `
uniform vec3 uColor;
varying vec3 vN;
varying vec3 vWP;
varying vec4 vDot;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWP);
  float ndv = abs(dot(N, V));
  // saturated glowing bead: coloured body, hot core, soft darker rim for contrast on bright ground
  vec3 col = uColor * 1.35;
  col = mix(col, vec3(1.0, 0.97, 0.9) * 1.4, pow(ndv, 6.0) * 0.45);
  col *= mix(0.55, 1.0, smoothstep(0.0, 0.45, ndv));
  gl_FragColor = vec4(col, vDot.x);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
const MARKER_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv * 2.0 - 1.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const MARKER_FRAGMENT = `
uniform vec3 uColor;
uniform float uTime2;
varying vec2 vUv;
void main() {
  float r = length(vUv);
  float ang = atan(vUv.y, vUv.x);
  float pulse = 0.5 + 0.5 * sin(uTime2 * 5.0);
  // outer ring made of rotating dashes
  float dashes = smoothstep(0.15, 0.45, sin(ang * 10.0 + uTime2 * 2.5));
  float outer = smoothstep(0.1, 0.0, abs(r - 0.86) - 0.02) * (0.45 + 0.55 * dashes);
  float edgeDark = smoothstep(0.06, 0.0, abs(r - 0.93)) * 0.5;
  // soft inner fill + expanding pulse + centre dot
  float fill = smoothstep(0.9, 0.1, r) * 0.22;
  float ph = fract(uTime2 * 0.8);
  float wave = exp(-pow((r - ph * 0.86) / 0.07, 2.0)) * (1.0 - ph) * 0.55;
  float dotc = smoothstep(0.13, 0.09, r) * (0.8 + 0.2 * pulse);
  float a = outer + fill + wave + dotc + edgeDark;
  a *= smoothstep(1.0, 0.95, r);
  vec3 col = mix(uColor * 1.3, vec3(1.0, 0.98, 0.92) * 1.3, dotc * 0.6 + outer * 0.2);
  col = mix(col, uColor * 0.25, edgeDark / max(a, 1e-3));
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
export class TrajectoryPreview {
  ctx;
  group = new Group();
  dots;
  aDot;
  dotMat;
  marker;
  markMat;
  m = new Matrix4();
  q = new Quaternion();
  s = new Vector3();
  p = new Vector3();
  up = new Vector3(0, 1, 0);
  flow = 0;
  clock = 0;
  constructor(ctx) {
    this.ctx = ctx;
    const dotGeometry = new IcosahedronGeometry(1, 2);
    this.aDot = new InstancedBufferAttribute(new Float32Array(288), 4).setUsage(DynamicDrawUsage);
    dotGeometry.setAttribute('aDot', this.aDot);
    this.dotMat = new ShaderMaterial({
      uniforms: {
        uColor: {
          value: new Color(),
        },
      },
      vertexShader: DOT_VERTEX,
      fragmentShader: DOT_FRAGMENT,
      transparent: true,
      depthWrite: false,
    });
    this.dots = new InstancedMesh(dotGeometry, this.dotMat, MAX_DOTS);
    this.dots.instanceMatrix.setUsage(DynamicDrawUsage);
    this.dots.frustumCulled = false;
    this.dots.renderOrder = 5;
    this.dots.count = 0;
    this.markMat = new ShaderMaterial({
      uniforms: {
        uColor: {
          value: new Color(),
        },
        uTime2: {
          value: 0,
        },
      },
      vertexShader: MARKER_VERTEX,
      fragmentShader: MARKER_FRAGMENT,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      side: DoubleSide,
    });
    const markerGeometry = new PlaneGeometry(2, 2);
    markerGeometry.rotateX(-Math.PI / 2);
    this.marker = new Mesh(markerGeometry, this.markMat);
    this.marker.frustumCulled = false;
    this.marker.renderOrder = 5;
    this.group.add(this.dots, this.marker);
    this.group.visible = false;
    this.group.name = 'paint-trajectory';
  }
  show(points, count, color, hitPoint, hitNormal, radius) {
    this.group.visible = true;
    this.dotMat.uniforms.uColor.value.copy(color);
    this.markMat.uniforms.uColor.value.copy(color);
    this.markMat.uniforms.uTime2.value = this.clock;
    const camPos = this.ctx.camera.position;
    let dotCount = 0;
    let nextDot = DOT_SPACING - (this.flow % DOT_SPACING);
    let travelled = 0;
    for (let i = 1; i < count && dotCount < MAX_DOTS; i++) {
      const ax = points[(i - 1) * 3];
      const ay = points[(i - 1) * 3 + 1];
      const az = points[(i - 1) * 3 + 2];
      const bx = points[i * 3];
      const by = points[i * 3 + 1];
      const bz = points[i * 3 + 2];
      const segLen = Math.hypot(bx - ax, by - ay, bz - az);
      let along = nextDot;
      for (; along <= segLen && dotCount < MAX_DOTS;) {
        const frac = segLen > 0 ? along / segLen : 0;
        this.p.set(ax + (bx - ax) * frac, ay + (by - ay) * frac, az + (bz - az) * frac);
        const pathDist = travelled + along;
        if (pathDist > 0.8) {
          const camDist = this.p.distanceTo(camPos);
          const size = Math.max(0.07, camDist * 0.0055) * (1 - Math.min(0.35, pathDist * 0.004));
          this.s.set(size, size, size);
          this.q.identity();
          this.m.compose(this.p, this.q, this.s);
          this.dots.setMatrixAt(dotCount, this.m);
          const fade = Math.min(1, (pathDist - 0.8) / 1.2);
          this.aDot.setXYZW(dotCount, fade, 0, 0, 0);
          dotCount++;
        }
        along += DOT_SPACING;
      }
      nextDot = along - segLen;
      travelled += segLen;
    }
    this.dots.count = dotCount;
    this.dots.instanceMatrix.needsUpdate = true;
    this.aDot.needsUpdate = true;
    if (hitPoint && hitNormal) {
      this.marker.visible = true;
      this.q.setFromUnitVectors(this.up, hitNormal);
      this.marker.position.copy(hitPoint).addScaledVector(hitNormal, 0.06);
      this.marker.quaternion.copy(this.q);
      const pulse = 1 + 0.04 * Math.sin(this.clock * 6);
      this.marker.scale.setScalar(radius * pulse);
    } else this.marker.visible = false;
  }
  hide() {
    this.group.visible = false;
  }
  update(dt) {
    this.flow += dt * 2.4;
    this.clock += dt;
  }
}
