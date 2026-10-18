/**
 * The vegetation system: bakes the field, builds trees, rocks, plants, grass and flowers, switches grass and flower quality with the settings, and answers trees-near-a-point and grass-clearing requests.
 */
import { Group } from 'three';
import { createTreeMaterials } from '../shared/tree-materials.js';
import { vegUniforms } from '../shared/veg-material.js';
import { VegField } from './field.js';
import { createFlowers } from './flowers.js';
import { createGrass } from './grass.js';
import { PlacementRules } from './placement.js';
import { createPlants } from './plants.js';
import { createRocks } from './rocks.js';
import { createTrees } from './trees.js';
function pickFieldRes(ctx) {
  const now = performance.now();
  let sum = 0;
  for (let i = 0; i < 1500; i++) {
    const x = ((i * 37) % 300) - 150;
    const z = ((i * 91) % 300) - 150;
    try {
      sum += ctx.terrain.heightAt(x, z) + ctx.terrain.grassDensityAt(x, z);
    } catch {}
  }
  const msPerQuery = (performance.now() - now) / 1500 + +(sum === Infinity);
  return msPerQuery * 641 * 641 < 700 ? 2 : msPerQuery * 481 * 481 < 700 ? 1.5 : 1;
}
export async function create(ctx) {
  const now = performance.now();
  const group = new Group();
  group.name = 'vegetation';
  ctx.scene.add(group);
  const field = new VegField(ctx, pickFieldRes(ctx));
  await field.bake();
  field.upload();
  const veg = {
    ctx,
    field,
    uniforms: vegUniforms(field),
  };
  const rules = new PlacementRules(ctx);
  let mats = null;
  let trees = null;
  try {
    mats = createTreeMaterials(veg);
    trees = createTrees(veg, mats, rules);
    group.add(trees.group);
  } catch (err) {
    console.error('[vegetation] trees failed', err);
  }
  let rocks = null;
  try {
    rocks = createRocks(veg, rules);
    group.add(rocks.group);
  } catch (err) {
    console.error('[vegetation] rocks failed', err);
  }
  let plants = null;
  try {
    if (mats) {
      plants = createPlants(veg, mats, rules, trees?.trees ?? []);
      group.add(plants.group);
    }
  } catch (err) {
    console.error('[vegetation] plants failed', err);
  }
  field.upload();
  let quality = ctx.settings.quality;
  let grass = null;
  try {
    grass = createGrass(veg, quality);
    group.add(grass.group);
  } catch (err) {
    console.error('[vegetation] grass failed', err);
  }
  let flowers = null;
  try {
    flowers = createFlowers(veg, quality);
    group.add(flowers.group);
  } catch (err) {
    console.error('[vegetation] flowers failed', err);
  }
  const offSettings = ctx.events.on('settings:changed', ({ settings }) => {
    if (settings && settings.quality !== quality) {
      quality = settings.quality;
      try {
        grass?.setQuality(quality);
        flowers?.setQuality(quality);
      } catch (err) {
        console.error('[vegetation] quality change failed', err);
      }
    }
  });
  if (ctx.debug)
    try {
      const folder = ctx.debug.addFolder('Vegetation');
      const toggles = {};
      for (const child of group.children) {
        toggles[child.name] = true;
        folder.add(toggles, child.name).onChange((visible) => (child.visible = visible));
      }
      const uniforms = grass?.uniforms;
      if (uniforms) folder.add(uniforms.uGHeight, 'value', 0.2, 2, 0.01).name('grass height');
    } catch (err) {
      console.warn('[vegetation] debug panel failed', err);
    }
  const stats = {
    ms: Math.round(performance.now() - now),
    field: field.n,
    blades: grass?.bladeCount ?? 0,
    trees: trees?.trees.length ?? 0,
    rocks: rocks?.count ?? 0,
    bigRocks: rocks?.sample ?? [],
    plants: plants?.counts ?? {},
    multiDraw: trees?.multiDraw ?? false,
  };
  if (ctx.shotMode || ctx.debug) globalThis.__veg = stats;
  console.info(
    `[vegetation] ready in ${stats.ms}ms (field ${field.n}², grass ${stats.blades} blades, trees ${stats.trees}, rocks ${stats.rocks})`,
  );
  return {
    treesNear(pos, radius) {
      return !trees || !pos || !Number.isFinite(radius) ? [] : trees.treesNear(pos, radius);
    },
    clearGrass(pos, radius) {
      try {
        field.clearDisc(pos.x, pos.z, radius);
        field.upload();
      } catch (err) {
        console.warn('[vegetation] clearGrass failed', err);
      }
    },
    dispose() {
      offSettings();
      ctx.scene.remove(group);
      grass?.dispose();
      flowers?.dispose();
      trees?.dispose();
      rocks?.dispose();
      plants?.dispose();
      mats?.dispose();
      field.texture?.dispose();
    },
  };
}
