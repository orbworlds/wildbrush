/**
 * The glowing hearts a defeated elite leaves behind: an extruded heart shape with a rainbow-swirled material, instanced.
 */
import {
  Color,
  DynamicDrawUsage,
  Euler,
  ExtrudeGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Shape,
  Vector3,
} from 'three';
import { PALETTE } from '../core/config.js';
function heartGeometry() {
  const shape = new Shape();
  shape.moveTo(0, -0.62);
  shape.bezierCurveTo(-0.16, -0.42, -0.66, -0.14, -0.64, 0.2);
  shape.bezierCurveTo(-0.62, 0.52, -0.22, 0.68, 0, 0.36);
  shape.bezierCurveTo(0.22, 0.68, 0.62, 0.52, 0.64, 0.2);
  shape.bezierCurveTo(0.66, -0.14, 0.16, -0.42, 0, -0.62);
  const geometry = new ExtrudeGeometry(shape, {
    depth: 0.26,
    bevelEnabled: true,
    bevelThickness: 0.16,
    bevelSize: 0.12,
    bevelSegments: 6,
    curveSegments: 24,
  });
  geometry.translate(0, 0, -0.13);
  geometry.computeVertexNormals();
  return geometry;
}
export class EliteHearts {
  mesh;
  m = new Matrix4();
  q = new Quaternion();
  e = new Euler();
  s = new Vector3();
  c = new Color();
  constructor(ctx, capacity = 4) {
    const material = new MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.18,
      metalness: 0,
    });
    const globals = ctx.globals;
    material.onBeforeCompile = (shader) => {
      for (const key in globals) if (!(key in shader.uniforms)) shader.uniforms[key] = globals[key];
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
varying vec3 vHLocal;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
vHLocal = position;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          #include <wb_common>
          varying vec3 vHLocal;
          vec3 hPal(float h) {
            vec3 R = vec3(1.0, 0.105, 0.04), B = vec3(0.07, 0.55, 1.0), Y = vec3(1.0, 0.66, 0.06), G = vec3(0.1, 0.68, 0.14);
            h = fract(h) * 4.0;
            vec3 c = mix(R, Y, clamp(h, 0.0, 1.0));
            c = mix(c, G, clamp(h - 1.0, 0.0, 1.0));
            c = mix(c, B, clamp(h - 2.0, 0.0, 1.0));
            c = mix(c, R, clamp(h - 3.0, 0.0, 1.0));
            return c;
          }`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          // a heart-red core with the reclaimed colour (instance colour) swirling through it
          float sw = sin(vHLocal.x * 5.0 + vHLocal.y * 4.0 + uTime * 1.6) * 0.5 + 0.5;
          float band = smoothstep(0.6, 0.92, sin(vHLocal.y * 9.0 - uTime * 2.2 + vHLocal.x * 3.0) * 0.5 + 0.5);
          vec3 rainbow = hPal(vHLocal.y * 0.45 + vHLocal.x * 0.25 + uTime * 0.12);
          vec3 hcol = mix(vec3(1.0, 0.13, 0.22), diffuseColor.rgb, 0.3 + 0.35 * sw);
          diffuseColor.rgb = mix(hcol, rainbow, band * 0.55);`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          totalEmissiveRadiance += diffuseColor.rgb * (0.35 + 0.12 * sin(uTime * 3.2));`,
        )
        .replace(
          '#include <opaque_fragment>',
          `{ float f = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.0);
             outgoingLight += diffuseColor.rgb * f * 0.9 + vec3(1.0) * f * 0.22; }
          #include <opaque_fragment>`,
        );
    };
    material.customProgramCacheKey = () => 'wb-elite-heart-v2';
    this.mesh = new InstancedMesh(heartGeometry(), material, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.name = 'elite-hearts';
    this.mesh.setColorAt(0, this.c.set(1, 1, 1));
  }
  render(hearts, time) {
    let count = 0;
    for (const heart of hearts) {
      if (!heart.active || count >= this.mesh.instanceMatrix.count) continue;
      const scale = 0.95 * (0.3 + 0.7 * Math.min(1, heart.age * 1.6)) * (1 + 0.05 * Math.sin(time * 4));
      this.e.set(0.12 * Math.sin(time * 1.3), heart.spin, 0);
      this.q.setFromEuler(this.e);
      this.s.setScalar(scale);
      this.m.compose(heart.pos, this.q, this.s);
      this.mesh.setMatrixAt(count, this.m);
      this.mesh.setColorAt(count, this.c.set(PALETTE[heart.color].hex));
      count++;
    }
    this.mesh.count = count;
    this.mesh.visible = count > 0;
    if (count > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
  }
}
