/**
 * Temple effect materials: flowing lava, freezable water, billboard flames, heat columns, light shafts, portal surfaces and ice that grows out from a point.
 */
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  FrontSide,
  Mesh,
  MeshStandardMaterial,
  ShaderMaterial,
  Vector3,
} from 'three';
export function makeLavaMaterial(ctx, heat) {
  return new ShaderMaterial({
    name: 'temple-lava',
    uniforms: {
      ...ctx.globals,
      uHeat: heat,
    },
    vertexShader: `
      attribute vec2 aFlow;
      varying vec3 vW;
      varying vec2 vFlow;
      void main() {
        vFlow = aFlow;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      #include <wb_common>
      uniform float uHeat;
      varying vec3 vW;
      varying vec2 vFlow;
      void main() {
        bool vert = abs(vFlow.y) > 2.5;
        vec2 p = vert ? vec2((vW.x + vW.z) * 2.2, vW.y * 0.9) : mat2(0.8, -0.6, 0.6, 0.8) * (vW.xz * 0.5);
        vec2 fl = vert ? vec2(0.0, uTime * 1.8) : vFlow * uTime * 0.16;
        float w1 = wbNoise2(p * 0.7 + fl * 0.4 + uTime * 0.03);
        float w2 = wbNoise2(p * 0.7 + vec2(5.2, 1.3) - fl * 0.3);
        vec2 q = p + vec2(w1, w2) * 1.5 - fl;
        float n = wbNoise2(q * 1.1) * 0.6 + wbNoise2(q * 2.3 + 7.0) * 0.3 + wbNoise2(q * 5.1 + 3.0) * 0.1;
        float crust = smoothstep(0.43, 0.58, n) * (vert ? 0.3 : 1.0);
        float vein = 1.0 - smoothstep(0.0, 0.045, abs(n - 0.4));
        vec3 hot = mix(vec3(0.95, 0.16, 0.03), vec3(1.0, 0.46, 0.08), smoothstep(0.15, 0.45, n));
        float pulse = 0.9 + 0.1 * sin(uTime * 1.3 + vW.x * 0.3 + vW.z * 0.2);
        vec3 c = hot * (vert ? 1.1 : 0.9) + vec3(1.0, 0.62, 0.22) * vein * 1.0;
        vec3 crustC = mix(vec3(0.05, 0.018, 0.012), vec3(0.2, 0.055, 0.02), wbNoise2(q * 4.0));
        c = mix(c, crustC, crust * 0.92);
        c *= uHeat * pulse;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}
export function makeWaterMaterial(ctx) {
  const freeze = Array(8).fill(0);
  const origins = [];
  const radius = Array(8).fill(10);
  for (let i = 0; i < 8; i++) origins.push(new Vector3());
  return {
    material: new ShaderMaterial({
      name: 'temple-water',
      uniforms: {
        ...ctx.globals,
        uFreeze: {
          value: freeze,
        },
        uFreezeO: {
          value: origins,
        },
        uFreezeR: {
          value: radius,
        },
      },
      vertexShader: `
      attribute vec2 aUv2;
      attribute vec2 aW;
      varying vec2 vUv2;
      varying vec3 vW;
      varying vec3 vN;
      varying float vSpeed;
      varying float vSeg;
      void main() {
        vUv2 = aUv2;
        vSpeed = aW.x;
        vSeg = aW.y;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
      fragmentShader: `
      #include <wb_common>
      uniform float uFreeze[8];
      uniform vec3 uFreezeO[8];
      uniform float uFreezeR[8];
      varying vec2 vUv2;
      varying vec3 vW;
      varying vec3 vN;
      varying float vSpeed;
      varying float vSeg;
      void main() {
        int si = int(vSeg + 0.5);
        float fz = 0.0; vec3 fo = vec3(0.0); float fr = 1.0;
        for (int i = 0; i < 8; i++) { if (i == si) { fz = uFreeze[i]; fo = uFreezeO[i]; fr = uFreezeR[i]; } }
        vec3 V = normalize(uCameraPos - vW);
        vec3 N = normalize(vN);
        float fres = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 2.5);
        // flowing water: long streaks riding the current, slow ripples, glints
        float t = uTime * vSpeed;
        vec2 q = vUv2;
        float a1 = wbNoise2(vec2(q.x * 2.6, (q.y - t) * 0.32));
        float a2 = wbNoise2(vec2(q.x * 6.5 + 3.0, (q.y - t * 1.35) * 0.55));
        float lines = smoothstep(0.56, 0.82, a1) * 0.55 + smoothstep(0.62, 0.86, a2) * 0.45;
        float ripple = wbNoise2(vec2(q.x * 1.3, (q.y - t * 0.6) * 0.9));
        vec3 deep = vec3(0.02, 0.12, 0.19);
        vec3 mid = vec3(0.05, 0.33, 0.43);
        vec3 w = mix(deep, mid, 0.3 + 0.6 * ripple);
        w += vec3(0.5, 0.82, 0.95) * lines * 0.5;
        float gl = smoothstep(0.9, 0.98, wbNoise2(vec2(q.x * 13.0, (q.y - t * 1.2) * 4.0)));
        w += vec3(0.85, 0.97, 1.0) * gl * 0.7;
        w += vec3(0.35, 0.62, 0.8) * fres * 0.55;
        w += uSkyColor * 0.06;
        // ice: spreads from the freeze origin
        float d = length(vW - fo);
        float n = wbNoise3(vW * 1.3);
        float front = fz * fr - d + (n - 0.5) * 1.6;
        float iceK = smoothstep(-0.05, 0.25, front) * step(0.001, fz);
        float edge = smoothstep(0.6, 0.0, abs(front)) * step(0.001, fz) * (1.0 - step(0.999, fz));
        float cr = 1.0 - smoothstep(0.0, 0.035, abs(wbNoise3(vW * 1.7) - 0.5));
        float cr2 = 1.0 - smoothstep(0.0, 0.03, abs(wbNoise3(vW * 4.3 + 2.0) - 0.5));
        float ib = wbNoise3(vW * 0.45);
        vec3 ice = mix(vec3(0.16, 0.45, 0.62), vec3(0.55, 0.82, 0.94), smoothstep(0.25, 0.8, ib));
        ice = mix(ice, vec3(0.92, 0.98, 1.0), cr * 0.65 + cr2 * 0.35);
        ice += vec3(0.5, 0.8, 1.0) * fres * 0.45;
        ice += vec3(0.9, 1.0, 1.0) * smoothstep(0.93, 0.99, wbNoise3(vW * 6.0)) * 0.5;
        vec3 c = mix(w, ice, iceK) + vec3(0.7, 0.9, 1.0) * edge * 1.4;
        gl_FragColor = vec4(c, 1.0);
      }`,
      side: DoubleSide,
    }),
    freeze,
    origin: origins,
    radius,
  };
}
export function makeFlames(ctx, id) {
  const level = Array(40).fill(0);
  const positions = [];
  const centers = [];
  const corners = [];
  const sizes = [];
  const tints = [];
  const metas = [];
  const indices = [];
  let count = 0;
  const material = new ShaderMaterial({
    name: `temple-flames-${id}`,
    uniforms: {
      ...ctx.globals,
      uFlame: {
        value: level,
      },
    },
    vertexShader: `
      attribute vec3 aCenter;
      attribute vec2 aCorner;
      attribute vec2 aSize;
      attribute vec3 aTint;
      attribute vec2 aMeta;
      uniform float uFlame[40];
      varying vec2 vUv;
      varying vec3 vTint;
      varying float vI;
      varying float vSeed;
      void main() {
        int fi = int(aMeta.x + 0.5);
        float I = 0.0;
        for (int i = 0; i < 40; i++) { if (i == fi) I = uFlame[i]; }
        vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        camR = normalize(vec3(camR.x, 0.0, camR.z) + vec3(1e-4, 0.0, 0.0));
        float grow = clamp(I, 0.0, 1.6);
        vec3 wp = aCenter + camR * aCorner.x * aSize.x * (0.55 + 0.45 * min(grow, 1.0)) + vec3(0.0, 1.0, 0.0) * aCorner.y * aSize.y * grow;
        vUv = aCorner;
        vTint = aTint;
        vI = I;
        vSeed = aMeta.y;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        if (I <= 0.001) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: `
      #include <wb_common>
      varying vec2 vUv;
      varying vec3 vTint;
      varying float vI;
      varying float vSeed;
      void main() {
        float y = vUv.y;
        float t = uTime * 2.4 + vSeed * 17.0;
        float n = wbNoise2(vec2(vUv.x * 3.2 + vSeed * 9.0, y * 2.6 - t));
        float n2 = wbNoise2(vec2(vUv.x * 7.5 - vSeed * 3.0, y * 5.2 - t * 1.6));
        float wx = abs(vUv.x + (n - 0.5) * 0.34 * y + sin(y * 5.0 - t * 1.3) * 0.04 * y);
        float prof = 0.5 * pow(y + 0.04, 0.35) * pow(max(1.0 - y, 0.0), 0.9);
        float body = smoothstep(prof, prof * 0.45, wx) * smoothstep(0.0, 0.08, y);
        body *= smoothstep(0.08, 0.5, n * 0.5 + n2 * 0.4 + (1.0 - y) * 0.62);
        float core = smoothstep(prof * 0.42, 0.0, wx) * smoothstep(0.6, 0.05, y);
        vec3 deep = vTint * vec3(1.0, 0.55, 0.4);
        vec3 c = mix(deep, vTint, smoothstep(0.0, 0.5, 1.0 - y) * 0.8 + 0.2);
        c = mix(c, mix(vTint, vec3(1.0, 0.95, 0.8), 0.55), core * 0.75);
        float a = body * clamp(vI, 0.0, 1.5);
        gl_FragColor = vec4(c * a * 1.6, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const geometry = new BufferGeometry();
  const mesh = new Mesh(geometry, material);
  mesh.name = `temple-flames-${id}`;
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  const color = new Color();
  return {
    mesh,
    level,
    add(pos, w, h, tint) {
      if (count >= 40) return 39;
      const index = count++;
      color.set(tint);
      const seed = Math.random();
      for (const [sx, sy] of [
        [1, 1],
        [0.6, 1.25],
      ]) {
        const base = positions.length / 3;
        for (const [cx, cy] of [
          [-0.5, 0],
          [0.5, 0],
          [0.5, 1],
          [-0.5, 1],
        ]) {
          positions.push(pos.x, pos.y, pos.z);
          centers.push(pos.x, pos.y, pos.z);
          corners.push(cx, cy);
          sizes.push(w * sx, h * sy);
          tints.push(color.r, color.g, color.b);
          metas.push(index, seed + sx);
        }
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
      return index;
    },
    build() {
      geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
      geometry.setAttribute('aCenter', new Float32BufferAttribute(centers, 3));
      geometry.setAttribute('aCorner', new Float32BufferAttribute(corners, 2));
      geometry.setAttribute('aSize', new Float32BufferAttribute(sizes, 2));
      geometry.setAttribute('aTint', new Float32BufferAttribute(tints, 3));
      geometry.setAttribute('aMeta', new Float32BufferAttribute(metas, 2));
      geometry.setIndex(indices);
    },
  };
}
export function makeColumnMaterial(ctx, color, intensity) {
  return new ShaderMaterial({
    name: 'temple-column',
    uniforms: {
      ...ctx.globals,
      uCol: {
        value: new Color(color),
      },
      uK: intensity,
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vW;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      #include <wb_common>
      uniform vec3 uCol;
      uniform float uK;
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vW;
      void main() {
        vec3 V = normalize(uCameraPos - vW);
        float side = abs(dot(normalize(vec3(vN.x, 0.0, vN.z) + 1e-4), normalize(vec3(V.x, 0.0, V.z) + 1e-4)));
        float streak = smoothstep(0.55, 0.9, wbNoise2(vec2(vUv.x * 22.0, vUv.y * 3.0 - uTime * 1.6)));
        float wisps = wbNoise2(vec2(vUv.x * 7.0 + uTime * 0.2, vUv.y * 5.0 - uTime * 0.9));
        float fall = smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
        float a = (streak * 0.6 + wisps * 0.25) * side * fall * uK;
        gl_FragColor = vec4(uCol * a, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
  });
}
export function makeBeamMaterial(ctx, color, intensity) {
  return new ShaderMaterial({
    name: 'temple-beam',
    uniforms: {
      ...ctx.globals,
      uCol: {
        value: new Color(color),
      },
      uK: intensity,
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vW;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      #include <wb_common>
      uniform vec3 uCol;
      uniform float uK;
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vW;
      void main() {
        vec3 V = normalize(uCameraPos - vW);
        vec3 N = normalize(vec3(vN.x, 0.0, vN.z) + 1e-4);
        vec3 Vh = normalize(vec3(V.x, 0.0, V.z) + 1e-4);
        float core = pow(abs(dot(N, Vh)), 1.6);
        float motes = smoothstep(0.8, 0.97, wbNoise2(vec2(vUv.x * 24.0, vUv.y * 30.0 - uTime * 0.6)));
        float fall = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.85, 1.0, vUv.y));
        float a = (core * 0.22 + motes * 0.25 * core) * fall * uK;
        gl_FragColor = vec4(uCol * a, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
  });
}
export function makePortalMaterial(ctx, colorA, colorB, intensity) {
  return new ShaderMaterial({
    name: 'temple-portal',
    uniforms: {
      ...ctx.globals,
      uA: {
        value: new Color(colorA),
      },
      uB: {
        value: new Color(colorB),
      },
      uK: intensity,
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      #include <wb_common>
      uniform vec3 uA;
      uniform vec3 uB;
      uniform float uK;
      varying vec2 vUv;
      void main() {
        vec2 p = (vUv - vec2(0.5, 0.45)) * vec2(1.0, 1.35);
        float r = length(p);
        float ang = atan(p.y, p.x);
        float sw = ang * 2.0 + r * 9.0 - uTime * 1.1;
        float band = 0.5 + 0.5 * sin(sw + wbNoise2(vec2(ang * 2.0, r * 4.0 - uTime * 0.3)) * 3.0);
        float n = wbNoise2(vec2(cos(ang) * 3.0 + r * 5.0, sin(ang) * 3.0 - uTime * 0.5));
        float sparks = smoothstep(0.86, 0.97, wbNoise2(vec2(ang * 6.0 + uTime * 0.4, r * 18.0 - uTime * 2.2)));
        float edgeX = smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
        float edgeY = smoothstep(0.0, 0.04, vUv.y) * smoothstep(1.0, 0.93, vUv.y);
        float m = edgeX * edgeY;
        // a dark heart with light wheeling round it, brightest at the rim
        vec3 core = uA * 0.12;
        vec3 swirl = mix(uA, uB, smoothstep(0.35, 0.9, band * 0.7 + n * 0.3));
        float lightK = smoothstep(0.05, 0.6, r) * smoothstep(0.3, 0.95, band * 0.8 + n * 0.3);
        vec3 c = mix(core, swirl * 1.35, lightK) + uB * sparks * 0.9;
        float rim = (1.0 - m) * smoothstep(0.0, 0.6, m + 0.3);
        c += uB * rim * 0.8;
        float a = m * (0.8 + 0.15 * lightK) * clamp(uK, 0.0, 1.0);
        c *= 0.75 + 0.35 * uK;
        gl_FragColor = vec4(c, a);
      }`,
    transparent: true,
    depthWrite: false,
    side: FrontSide,
  });
}
export function makeIceMaterial(ctx, reveal, from, span) {
  const globals = ctx.globals;
  const material = new MeshStandardMaterial({
    color: 0xcfeeff,
    roughness: 0.12,
    metalness: 0,
    transparent: false,
  });
  material.name = 'temple-ice';
  material.side = 2;
  const uniforms = {
    uReveal: reveal,
    uOrigin: from,
    uSpan: {
      value: span,
    },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, globals, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vIW;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
vIW = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
#include <wb_common>
varying vec3 vIW;
uniform float uReveal;
uniform vec3 uOrigin;
uniform float uSpan;`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        float iceN = wbNoise3(vIW * 1.4);
        float iceFront = uReveal * (uSpan + 1.5) - length(vIW - uOrigin) + (iceN - 0.5) * 1.2;
        if (iceFront < 0.0) discard;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float cr = 1.0 - smoothstep(0.0, 0.04, abs(wbNoise3(vIW * 1.6) - 0.5));
          float cr2 = 1.0 - smoothstep(0.0, 0.03, abs(wbNoise3(vIW * 4.1 + 3.0) - 0.5));
          float ib = wbNoise3(vIW * 0.5);
          diffuseColor.rgb = mix(vec3(0.18, 0.46, 0.64), vec3(0.6, 0.84, 0.95), smoothstep(0.2, 0.8, ib));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.99, 1.0), cr * 0.6 + cr2 * 0.3);
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec3 iV = normalize(vViewPosition);
          float fr = pow(1.0 - clamp(abs(dot(normal, iV)), 0.0, 1.0), 2.5);
          totalEmissiveRadiance += vec3(0.3, 0.6, 0.95) * (0.12 + fr * 0.7);
          float edge = smoothstep(0.8, 0.0, iceFront) * step(uReveal, 0.999);
          totalEmissiveRadiance += vec3(0.7, 0.9, 1.0) * edge * 1.6;
        }`,
      );
  };
  material.customProgramCacheKey = () => 'wb-temple-ice-v1';
  return material;
}
