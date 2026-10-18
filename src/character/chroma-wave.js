/**
 * The Chroma Brush spin wave: a rainbow ring that spreads over the terrain with a ragged curtain of colour streaking up at its front, then fades.
 */
import {
  AdditiveBlending,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  RingGeometry,
  ShaderMaterial,
  Vector3,
} from 'three';
import { RAINBOW_GLSL, rainbowUniform } from './chroma-brush.js';
const CHROMA_WAVE_VERTEX = `
  #include <wb_common>
  uniform vec3 uCenter;
  uniform float uRadius;
  uniform float uHeight;
  varying vec2 vXZ;
  varying float vH;
  void main() {
    vec3 p = position;
    vXZ = p.xz;
    vec2 wxz = uCenter.xz + p.xz * uRadius;
    float gy = max(wbTerrainHeight(wxz), uCenter.y - 0.6);
    gy = min(gy, uCenter.y + 2.5);
    vH = p.y;
    vec3 wp = vec3(wxz.x, gy + 0.22 + p.y * uHeight, wxz.y);
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }
`;
const CHROMA_WAVE_FRAGMENT = `
  #include <wb_common>
  ${RAINBOW_GLSL}
  uniform float uFade;
  uniform float uCurtain;
  varying vec2 vXZ;
  varying float vH;
  void main() {
    float d = length(vXZ);
    float ang = atan(vXZ.x, vXZ.y);
    // sector colours (matching the painted quadrants), softly blended
    float k = (ang + 3.14159265) / 1.5707963 - 0.5;
    vec3 c = wbRb(k + 0.5);
    float a;
    vec3 col;
    if (uCurtain > 0.5) {
      // a ragged, brushy wall of colour at the wavefront, streaking upwards
      float streak = wbNoise2(vec2(ang * 26.0, vH * 1.5 - uTime * 3.0));
      float top = 0.55 + 0.45 * wbNoise2(vec2(ang * 7.0, uTime * 1.3));
      a = pow(1.0 - smoothstep(0.0, top, vH), 1.6) * (0.25 + 0.75 * streak);
      col = c * 1.25 + vec3(0.12);
    } else {
      float edge = smoothstep(0.78, 0.97, d) * (1.0 - smoothstep(0.975, 1.0, d));
      float wash = smoothstep(0.15, 0.95, d) * 0.35;
      float bristle = 0.75 + 0.25 * wbNoise2(vec2(ang * 22.0, d * 8.0));
      a = max(edge, wash) * bristle;
      col = c * (1.2 + edge * 0.9);
    }
    a *= uFade;
    if (a < 0.01) discard;
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
export class ChromaWave {
  group = new Group();
  ringU;
  curtU;
  t = -1;
  dur = 0.6;
  radius = 6;
  constructor(ctx) {
    this.group.name = 'chroma-wave';
    this.group.visible = false;
    const makeUniforms = () => ({
      ...ctx.globals,
      uRb: rainbowUniform(),
      uCenter: {
        value: new Vector3(),
      },
      uRadius: {
        value: 1,
      },
      uHeight: {
        value: 0,
      },
      uFade: {
        value: 1,
      },
      uCurtain: {
        value: 0,
      },
    });
    this.ringU = makeUniforms();
    this.curtU = makeUniforms();
    this.curtU.uCurtain.value = 1;
    const ringGeo = new RingGeometry(0, 1, 96, 10);
    ringGeo.rotateX(-Math.PI / 2);
    const ring = new Mesh(
      ringGeo,
      new ShaderMaterial({
        uniforms: this.ringU,
        vertexShader: CHROMA_WAVE_VERTEX,
        fragmentShader: CHROMA_WAVE_FRAGMENT,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    const curtainGeo = new CylinderGeometry(1, 1, 1, 96, 1, true);
    curtainGeo.translate(0, 0.5, 0);
    const curtain = new Mesh(
      curtainGeo,
      new ShaderMaterial({
        uniforms: this.curtU,
        vertexShader: CHROMA_WAVE_VERTEX,
        fragmentShader: CHROMA_WAVE_FRAGMENT,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        blending: AdditiveBlending,
      }),
    );
    ring.frustumCulled = curtain.frustumCulled = false;
    ring.renderOrder = 4;
    curtain.renderOrder = 5;
    this.group.add(ring, curtain);
  }
  get active() {
    return this.t >= 0;
  }
  get front() {
    const prog = Math.min(1, Math.max(0, this.t / this.dur));
    return 0.6 + (this.radius - 0.6) * (1 - (1 - prog) * (1 - prog));
  }
  start(center, radius, dur) {
    this.t = 0;
    this.dur = Math.max(0.2, dur);
    this.radius = radius;
    this.ringU.uCenter.value.copy(center);
    this.curtU.uCenter.value.copy(center);
    this.group.visible = true;
  }
  update(dt) {
    if (this.t < 0) return;
    this.t += dt;
    const end = this.dur + 0.55;
    if (this.t >= end) {
      this.t = -1;
      this.group.visible = false;
      return;
    }
    const front = this.front;
    const fadeOut = Math.max(0, this.t - this.dur) / 0.55;
    this.ringU.uRadius.value = front;
    this.curtU.uRadius.value = front;
    this.ringU.uFade.value = (1 - fadeOut) * (1 - fadeOut);
    const prog = Math.min(1, this.t / this.dur);
    this.curtU.uHeight.value = 1.25 * (1 - prog * 0.45) * (1 - fadeOut * 0.5);
    this.curtU.uFade.value = (1 - prog * 0.55) * (1 - fadeOut) * 0.7;
  }
}
