/**
 * Afterimage ghosts of the hero: a small pool of translucent, rim-lit copies of the skinned body that freeze the current pose and fade out, left behind by dodges, perfect dodges and the flurry.
 */
import { Matrix4, MeshBasicMaterial, Skeleton, SkinnedMesh } from 'three';
import { createBones } from './rig.js';
const GHOST_COUNT = 7;
export class HeroGhosts {
  hero;
  pool = [];
  constructor(ctx, hero) {
    this.hero = hero;
    const boneInverses = hero.skeleton.boneInverses;
    for (let i = 0; i < GHOST_COUNT; i++) {
      const bones = createBones();
      for (const bone of bones) bone.matrixAutoUpdate = false;
      const skeleton = new Skeleton(
        bones,
        boneInverses.map((inverse) => inverse.clone()),
      );
      const material = new MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      });
      material.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
          .replace(
            '#include <common>',
            `#include <common>
varying vec3 vGN;
varying vec3 vGV;`,
          )
          .replace(
            '#include <project_vertex>',
            `#include <project_vertex>
#ifdef USE_SKINNING
vGN = normalize(transformedNormal);
#else
vGN = vec3(0.0, 0.0, 1.0);
#endif
vGV = -mvPosition.xyz;`,
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <common>',
            `#include <common>
varying vec3 vGN;
varying vec3 vGV;`,
          )
          .replace(
            '#include <opaque_fragment>',
            `float gRim = 1.0 - abs(dot(normalize(vGN), normalize(vGV)));
             gRim = pow(gRim, 1.6);
             outgoingLight = mix(diffuseColor.rgb * 0.75, mix(diffuseColor.rgb, vec3(1.0), 0.55) * 1.6, gRim);
             diffuseColor.a *= 0.3 + 0.7 * gRim;
             #include <opaque_fragment>`,
          );
      };
      material.customProgramCacheKey = () => 'wb-hero-ghost-v1';
      const mesh = new SkinnedMesh(hero.mesh.geometry, material);
      mesh.bind(skeleton, new Matrix4());
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.renderOrder = 4;
      mesh.visible = false;
      mesh.name = 'hero-ghost';
      ctx.scene.add(mesh);
      this.pool.push({
        mesh,
        bones,
        mat: material,
        age: 0,
        life: 0.3,
        alpha: 0.5,
        alive: false,
      });
    }
  }
  spawn(color, alpha = 0.55, life = 0.35) {
    let ghost = this.pool.find((g) => !g.alive);
    if (!ghost) {
      ghost = this.pool[0];
      for (const g of this.pool) if (g.age / g.life > ghost.age / ghost.life) ghost = g;
    }
    const bones = this.hero.bones;
    for (let i = 0; i < bones.length; i++) ghost.bones[i].matrixWorld.copy(bones[i].matrixWorld);
    if (typeof color == 'number') ghost.mat.color.setHex(color);
    else ghost.mat.color.copy(color);
    ghost.alpha = alpha;
    ghost.life = life;
    ghost.age = 0;
    ghost.alive = true;
    ghost.mat.opacity = alpha;
    ghost.mesh.visible = true;
  }
  update(dt) {
    for (const ghost of this.pool) {
      if (!ghost.alive) continue;
      ghost.age += dt;
      const t = ghost.age / ghost.life;
      if (t >= 1) {
        ghost.alive = false;
        ghost.mesh.visible = false;
        continue;
      }
      ghost.mat.opacity = ghost.alpha * (1 - t) ** 1.4;
    }
  }
}
