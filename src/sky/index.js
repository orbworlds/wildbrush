/**
 * Sky system entry: builds the Painted Aerie (isles, ruins, water, clouds, flora, colliders, chests and ink plants) and its side realms, unseals the grand chest once both sky elites fall, and handles warps and realm respawns. Every frame it updates the realms and hides what is far from the camera.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  Vector3,
  WireframeGeometry,
} from 'three';
import { COLLISION_GROUPS, SKY_ISLAND } from '../core/config.js';
import { SkyChests } from '../shared/chests.js';
import { InkPlants } from '../shared/ink.js';
import { Particles } from '../shared/particles.js';
import { AERIE_ISLES, AERIE_SPOTS } from './aerie-layout.js';
import { SkyBuilder } from './builder.js';
import { CanopyRealm } from './canopy.js';
import { CinderRealm } from './cinder.js';
import { createClouds } from './clouds.js';
import { createFlora } from './flora.js';
import { FrostspireRealm } from './frostspire.js';
import { FloatingIsle } from './isle.js';
import { createSkyMaterials } from './materials.js';
import { buildAerieRuins } from './ruins.js';
import { SkyVegField } from './veg-field.js';
import { SkyVitality } from './vitality.js';
import { buildSkyWater } from './water.js';
export async function create(ctx) {
  const now = performance.now();
  const flags = new Set((ctx.params.get('sky') ?? '').split(',').filter(Boolean));
  const quality = ctx.settings.quality;
  const group = new Group();
  group.name = 'sky-aerie';
  ctx.scene.add(group);
  const isles = AERIE_ISLES.map((def) => new FloatingIsle(def));
  const isleById = new Map(isles.map((isle) => [isle.def.id, isle]));
  const main = isleById.get('main');
  const loc = {
    i0: 0,
    i1: 0,
    i2: 0,
    w0: 0,
    w1: 0,
    w2: 0,
  };
  const groundAt = (x, z) => {
    let best = null;
    for (const isle of isles)
      if (isle.locate(x, z, loc)) {
        const y = isle.heightFrom(loc);
        if (best === null || y > best) best = y;
      }
    return best;
  };
  const groundOr = (x, z, fallback) => groundAt(x, z) ?? fallback;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let topY = -Infinity;
  let botY = Infinity;
  for (const isle of isles) {
    minX = Math.min(minX, isle.cx - isle.maxR);
    maxX = Math.max(maxX, isle.cx + isle.maxR);
    minZ = Math.min(minZ, isle.cz - isle.maxR);
    maxZ = Math.max(maxZ, isle.cz + isle.maxR);
    topY = Math.max(topY, isle.maxY);
    botY = Math.min(botY, isle.bottomY);
  }
  const size = Math.ceil(Math.max(maxX - minX, maxZ - minZ) + 8);
  const x0 = Math.floor((minX + maxX) / 2 - size / 2);
  const z0 = Math.floor((minZ + maxZ) / 2 - size / 2);
  const inBounds = (x, z) => x >= x0 && z >= z0 && x <= x0 + size && z <= z0 + size;
  const vit = new SkyVitality(x0, z0, size, 256);
  if (flags.has('bloom')) vit.restoreAll();
  const mats = createSkyMaterials(ctx, vit);
  const builder = new SkyBuilder(ctx);
  const ruins = buildAerieRuins(builder, isleById, groundOr, quality);
  const wire = flags.has('wire');
  const wireGeos = [];
  isles.forEach((isle, i) => {
    const geo = isle.geometry();
    geo.setAttribute('aFloat', new BufferAttribute(new Float32Array(isle.vertCount), 1));
    if (wire) wireGeos.push(new WireframeGeometry(geo));
    builder.rockParts.splice(i, 0, geo);
  });
  const built = builder.build(mats, group);
  const platforms = ruins.platforms;
  let halo = null;
  if (ruins.haloGeo) {
    halo = new Mesh(ruins.haloGeo, mats.stone);
    halo.name = 'sky-halo';
    halo.castShadow = true;
    halo.position.copy(ruins.grand.pos).add(new Vector3(0, 8.6, 0));
    group.add(halo);
  }
  let water = null;
  try {
    water = buildSkyWater(ctx, ruins.falls, ruins.pools, groundOr);
    group.add(water.mesh);
  } catch (err) {
    console.error('[sky] water failed', err);
  }
  let clouds = null;
  try {
    clouds = createClouds(ctx, isles, water?.mistPoints ?? [], quality);
    group.add(clouds.mesh);
  } catch (err) {
    console.error('[sky] clouds failed', err);
  }
  let flora = null;
  try {
    flora = createFlora(
      ctx,
      vit,
      new SkyVegField(x0, z0, size, isles, ruins.clear, quality === 'low' ? 1.5 : 2),
      ruins.trees,
      groundAt,
      () => SKY_ISLAND.y,
    );
    group.add(flora.near, flora.trees);
  } catch (err) {
    console.error('[sky] flora failed', err);
  }
  const offs = [];
  offs.push(
    ctx.events.on('settings:changed', ({ settings }) => {
      try {
        flora?.setQuality(settings.quality);
      } catch (err) {
        console.warn('[sky] flora quality change failed', err);
      }
    }),
  );
  const RAPIER = ctx.RAPIER;
  const FIX_INTERNAL_EDGES = RAPIER.TriMeshFlags?.FIX_INTERNAL_EDGES;
  const colliders = [...built.colliders];
  for (const isle of isles) {
    const parts = [
      [isle.index.slice(0, isle.topTris * 3), 'grass'],
      [isle.index.slice(isle.topTris * 3), 'rock'],
    ];
    for (const [tris, surface] of parts) {
      let collider = null;
      for (const meshFlags of [FIX_INTERNAL_EDGES, undefined])
        try {
          const desc = RAPIER.ColliderDesc.trimesh(isle.pos, tris, meshFlags);
          if (!desc) continue;
          desc.setCollisionGroups(COLLISION_GROUPS.terrain).setFriction(0.9);
          collider = ctx.physics.createCollider(desc);
          break;
        } catch (err) {
          if (meshFlags === undefined) console.error('[sky] trimesh failed', isle.def.id, err);
        }
      if (collider) {
        ctx.colliders.register(collider, {
          kind: 'terrain',
          surface,
          object: built.rock ?? group,
          data: {
            sky: isle.def.id,
          },
        });
        colliders.push(collider);
      }
    }
  }
  const spots = {};
  for (const [id, def] of Object.entries(AERIE_SPOTS)) {
    const isle = isleById.get(def.isle);
    if (!isle) continue;
    const x2 = isle.cx + def.x;
    const z = isle.cz + def.z;
    spots[id] = new Vector3(x2, groundOr(x2, z, isle.def.y), z);
  }
  const center = new Vector3(main.cx, groundOr(main.cx, main.cz, SKY_ISLAND.y), main.cz);
  spots.shrine = ruins.grand.pos.clone();
  spots.grand = ruins.grand.pos.clone();
  const aerieSurfaceAt = (x, z) => {
    if (!Number.isFinite(x) || !Number.isFinite(z) || !inBounds(x, z)) return null;
    let y = groundAt(x, z);
    if (y === null) return null;
    for (const plat of platforms)
      if (plat.kind === 'disc') {
        const dx = x - plat.x;
        const dz = z - plat.z;
        if (dx * dx + dz * dz <= plat.r * plat.r && plat.y > y) y = plat.y;
      } else {
        const dx = plat.x1 - plat.x0;
        const dz = plat.z1 - plat.z0;
        const lenSq = dx * dx + dz * dz;
        if (lenSq <= 0) continue;
        const along = ((x - plat.x0) * dx + (z - plat.z0) * dz) / lenSq;
        if (along < 0 || along > 1 || Math.abs((x - plat.x0) * dz - (z - plat.z0) * dx) / Math.sqrt(lenSq) > plat.hw)
          continue;
        const rampY = plat.y0 + (plat.y1 - plat.y0) * along;
        if (rampY > y) y = rampY;
      }
    return y;
  };
  const isOnAerie = (pos, up = 2.5) => {
    if (!pos) return false;
    const y = aerieSurfaceAt(pos.x, pos.z);
    return y !== null && pos.y >= y - 0.6 && pos.y <= y + up;
  };
  const realms = [];
  {
    const opts = {
      quality,
      solved: (ctx.params.get('isles') ?? '').split(',').includes('solved'),
      bloom: flags.has('bloom'),
    };
    const realmClasses = (ctx.params.get('isles') ?? '').split(',').includes('off')
      ? []
      : [FrostspireRealm, CinderRealm, CanopyRealm];
    for (const RealmClass of realmClasses) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      let realm = null;
      const start = performance.now();
      try {
        realm = new RealmClass(ctx, opts);
        realm.build();
        realm.finish();
        group.add(realm.group);
        realms.push(realm);
        for (const [id, spot] of Object.entries(realm.spots)) spots[id] = spot;
        console.info(`[sky] ${realm.name} built in ${(performance.now() - start).toFixed(0)}ms`);
      } catch (err) {
        console.error('[sky] isle failed', err);
        try {
          realm?.dispose();
        } catch {}
      }
    }
  }
  const surfaceAt = (x, z) => {
    const y = aerieSurfaceAt(x, z);
    if (y !== null) return y;
    for (const realm of realms) {
      const realmY = realm.surfaceAt(x, z);
      if (realmY !== null) return realmY;
    }
    return null;
  };
  const isOnSky = (pos, up = 2.5) => {
    if (!pos) return false;
    const y = surfaceAt(pos.x, pos.z);
    return y !== null && pos.y >= y - 0.6 && pos.y <= y + up;
  };
  const inSky = (pos) =>
    !!pos && Number.isFinite(pos.x + pos.y + pos.z) && inBounds(pos.x, pos.z) && pos.y > botY - 10 && pos.y < topY + 40;
  const withScene = (scene) =>
    new Proxy(ctx, {
      get: (target, key) => (key === 'scene' ? scene : Reflect.get(target, key)),
    });
  const fxGroup = new Group();
  fxGroup.name = 'sky-fx';
  const inkGroup = new Group();
  inkGroup.name = 'sky-ink';
  group.add(fxGroup, inkGroup);
  let particles = null;
  let inkPlants = null;
  try {
    particles = new Particles(withScene(fxGroup), quality === 'low' ? 250 : 500);
  } catch (err) {
    console.warn('[sky] particles failed', err);
  }
  if (particles && ruins.ink.length)
    try {
      inkPlants = new InkPlants(withScene(inkGroup), particles);
      for (const ink of ruins.ink) inkPlants.addAt(ink.color, ink.pos);
      inkPlants.build();
    } catch (err) {
      console.warn('[sky] ink plants failed', err);
      inkPlants = null;
    }
  const inkCenter = spots.islet1?.clone() ?? center.clone();
  const faceToward = (pos, x, z) => Math.atan2(x - pos.x, z - pos.z);
  const isleOf = (key) => isleById.get(AERIE_SPOTS[key]?.isle ?? 'main') ?? main;
  const chestDefs = [];
  const addChest = (id, spot, kind, loot, facing) => {
    const pos = spots[spot];
    if (!pos) return;
    const isle = isleOf(spot);
    chestDefs.push({
      id,
      kind,
      pos: pos.clone(),
      facing: facing ?? faceToward(pos, isle.cx, isle.cz),
      loot,
    });
  };
  chestDefs.push({
    id: 'grand',
    kind: 'grand',
    pos: ruins.grand.pos.clone(),
    facing: ruins.grand.facing,
    loot: {
      item: 'skyMantle',
    },
  });
  addChest('chest1', 'chest1', 'vessel', {
    item: 'staminaVessel',
  });
  addChest('chest2', 'chest2', 'vessel', {
    item: 'staminaVessel',
  });
  addChest('chest3', 'chest3', 'vessel', {
    item: 'staminaVessel',
  });
  addChest('inkChest', 'inkChest', 'small', {
    ink: true,
  });
  addChest(
    'heartChest',
    'heartChest',
    'small',
    {
      hearts: 20,
    },
    faceToward(spots.heartChest ?? center, center.x, center.z),
  );
  const skyElites = new Set();
  let chests = null;
  try {
    chests = new SkyChests(ctx, chestDefs, {
      sealed: !flags.has('open'),
      lenses: ruins.lenses,
      particles,
      onOpened: (chest) => {
        if (chest.kind === 'grand') {
          vit.bloom(chest.pos.x, chest.pos.z, size * 1.1, 7, 1);
          for (const isle of isles) if (isle !== main) vit.bloom(isle.cx, isle.cz, isle.maxR + 6, 4, 0.8);
        } else vit.bloom(chest.pos.x, chest.pos.z, chest.kind === 'vessel' ? 18 : 10, 2.2, 0.8);
      },
    });
    group.add(chests.group);
  } catch (err) {
    console.error('[sky] chests failed', err);
  }
  offs.push(
    ctx.events.on('paint:splat', (splat) => {
      if (splat.surface !== 'world' || !inSky(splat.position)) return;
      const radius = Math.max(4, Math.min(10, (splat.radius || 1.65) * 4));
      vit.bloom(
        splat.position.x,
        splat.position.z,
        radius,
        1.1,
        vit.at(splat.position.x, splat.position.z) > 0.9 ? 0 : 0.25,
      );
    }),
    ctx.events.on('enemy:death', (foe) => {
      if (inSky(foe.position)) vit.bloom(foe.position.x, foe.position.z, foe.kind === 'brute' ? 12 : 9, 1.5, 0.6);
    }),
    ctx.events.on('elite:defeated', (elite) => {
      if (
        inSky(elite.position) &&
        (skyElites.add(elite.id),
        vit.bloom(elite.position.x, elite.position.z, 30, 3.2, 1),
        chests?.setGuardians(skyElites.size),
        skyElites.size >= 2 && chests?.sealed)
      ) {
        chests.unseal();
        try {
          ctx.ui.toast('The Sky Shrine is unsealed', 'Its grand chest awaits atop the shrine');
        } catch {}
      }
    }),
  );
  let announcedAt = -Infinity;
  let lastOn = -Infinity;
  const discover = () => {
    const state = ctx.player?.state;
    if (!state || ctx.player.isStub) return;
    const elapsed = ctx.time.elapsed;
    if (state.mode !== 'fly' && isOnAerie(state.position, 1.2)) {
      if (announcedAt === -Infinity || elapsed - lastOn > 90) {
        announcedAt = elapsed;
        try {
          ctx.events.emit('area:enter', {
            id: 'aerie',
            name: 'The Painted Aerie',
            subtitle: 'Where the first painters mixed the sky',
          });
        } catch {}
      }
      lastOn = elapsed;
    }
  };
  let warpDelay = 0;
  const warp = ctx.params.get('warp') ?? '';
  const warpSpot = warp === 'aerie' ? 'landing' : warp.startsWith('aerie-') ? warp.slice(6) : '';
  const warpToSpot = () => {
    const target = spots[warpSpot];
    if (target)
      try {
        let pos = target.clone();
        if (
          warpSpot.startsWith('chest') ||
          warpSpot.endsWith('Chest') ||
          warpSpot === 'grand' ||
          warpSpot === 'shrine'
        ) {
          const chest = chestDefs.find((def) => def.pos.distanceTo(target) < 0.5);
          if (chest)
            pos = chest.pos.clone().add(new Vector3(Math.sin(chest.facing) * 2, 0, Math.cos(chest.facing) * 2));
        }
        pos.y = (surfaceAt(pos.x, pos.z) ?? pos.y) + 0.3;
        ctx.player.teleport(
          pos,
          Math.atan2(target.x - pos.x, target.z - pos.z) || Math.atan2(center.x - pos.x, center.z - pos.z),
        );
      } catch (err) {
        console.warn('[sky] warp failed', err);
      }
  };
  if (warpSpot && spots[warpSpot]) {
    warpDelay = 4;
    offs.push(ctx.events.on('game:start', warpToSpot));
  }
  let realmWarp = null;
  for (const realm of realms)
    if (warp === realm.id)
      realmWarp = {
        rm: realm,
        spot: `${realm.id}Landing`,
      };
    else if (warp.startsWith(`${realm.id}-`) && warp.length > realm.id.length + 1) {
      const suffix = warp.slice(realm.id.length + 1);
      realmWarp = {
        rm: realm,
        spot: realm.id + suffix[0].toUpperCase() + suffix.slice(1),
      };
    }
  let realmWarpDelay = 0;
  const warpToRealm = () => {
    if (!realmWarp) return;
    const { rm, spot } = realmWarp;
    const target = rm.spots[spot] ?? rm.landing();
    try {
      let pos = target.clone();
      let angle = Math.atan2(rm.cx - pos.x, rm.cz - pos.z);
      const chest = rm.chestDefs.find((chestDef) => chestDef.pos.distanceTo(target) < 0.5);
      if (chest) {
        pos = chest.pos.clone().add(new Vector3(Math.sin(chest.facing) * 2.2, 0, Math.cos(chest.facing) * 2.2));
        angle = chest.facing + Math.PI;
      }
      const groundY = surfaceAt(pos.x, pos.z);
      pos.y = (groundY !== null && Math.abs(groundY - target.y) < 1.5 ? groundY : target.y) + 0.3;
      ctx.player.teleport(pos, angle);
    } catch (err) {
      console.warn('[sky] isle warp failed', err);
    }
  };
  if (realmWarp) {
    realmWarpDelay = 5;
    offs.push(ctx.events.on('game:start', warpToRealm));
  }
  let diedIn = null;
  offs.push(
    ctx.events.on('player:death', (death) => {
      diedIn = realms.find((realm) => realm.contains(death.position)) ?? null;
    }),
    ctx.events.on('player:respawn', () => {
      const realm = diedIn;
      diedIn = null;
      if (realm)
        try {
          const pos = realm.landing().clone();
          pos.y = (realm.surfaceAt(pos.x, pos.z) ?? pos.y) + 0.2;
          ctx.player.teleport(pos, Math.atan2(realm.cx - pos.x, realm.cz - pos.z));
        } catch (err) {
          console.warn('[sky] isle respawn failed', err);
        }
    }),
  );
  if (wire) {
    const material = new LineBasicMaterial({
      color: 0x40ffd0,
      transparent: true,
      opacity: 0.35,
      depthTest: true,
    });
    for (const geo of wireGeos) group.add(new LineSegments(geo, material));
    try {
      const vertices = ctx.physics.debugRender().vertices;
      const lines = [];
      for (let i = 0; i + 5 < vertices.length; i += 6)
        if (vertices[i + 1] > botY - 5 && inBounds(vertices[i], vertices[i + 2]) && vertices[i + 4] > botY - 5)
          lines.push(vertices[i], vertices[i + 1], vertices[i + 2], vertices[i + 3], vertices[i + 4], vertices[i + 5]);
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(lines, 3));
      group.add(
        new LineSegments(
          geometry,
          new LineBasicMaterial({
            color: 0xff40a0,
          }),
        ),
      );
    } catch (err) {
      console.warn('[sky] debugRender failed', err);
    }
  }
  const camDist = () => {
    const position = ctx.camera.position;
    let best = Infinity;
    for (const isle of isles) {
      const dh = Math.max(0, Math.hypot(position.x - isle.cx, position.z - isle.cz) - isle.maxR);
      const dy =
        position.y > isle.maxY ? position.y - isle.maxY : position.y < isle.bottomY ? isle.bottomY - position.y : 0;
      best = Math.min(best, Math.hypot(dh, dy));
    }
    return best;
  };
  console.info(`[sky] Painted Aerie built in ${(performance.now() - now).toFixed(0)}ms`, {
    isles: isles.length,
    verts: isles.reduce((acc, isle) => acc + isle.vertCount, 0),
    colliders: colliders.length,
    chests: chestDefs.length,
    trees: flora?.treeCount ?? 0,
  });
  if (ctx.shotMode || ctx.debug)
    globalThis.__wbSky = {
      isles,
      spots,
      vit,
      groundAt,
      chests,
      platforms,
      skyElites,
      camDist,
      realms,
      surfaceAt,
      buildMs: Math.round(performance.now() - now),
    };
  let discoverT = 0;
  let fxUntil = 0;
  let errors = 0;
  let inkWasNear = false;
  const frame = (dt) => {
    if (warpDelay > 0 && --warpDelay === 0) warpToSpot();
    if (realmWarpDelay > 0 && --realmWarpDelay === 0) warpToRealm();
    for (const realm of realms) realm.update(dt);
    const realDt = ctx.time.realDt;
    vit.update(dt);
    const dist = camDist();
    const near = dist < 90;
    if (flora) {
      flora.near.visible = dist < 75;
      flora.trees.visible = dist < 240;
    }
    if (chests) {
      chests.group.visible = dist < 170;
      chests.update(dt, realDt, near && !ctx.player?.isStub);
      if (chests.fxActive) fxUntil = ctx.time.elapsed + 3;
    }
    fxGroup.visible = dist < 120 && ctx.time.elapsed < fxUntil;
    if (fxGroup.visible) particles?.update(dt);
    const inkDist = ctx.camera.position.distanceTo(inkCenter);
    inkGroup.visible = inkDist < 70;
    const state = ctx.player?.state;
    const inkNear = !!inkPlants && !!state && state.position.distanceToSquared(inkCenter) < 900;
    if (inkPlants && inkNear) {
      fxUntil = Math.max(fxUntil, ctx.time.elapsed + 3);
      try {
        inkPlants.update(dt, !!chests && (chests.busy || chests.prompting));
      } catch {}
    } else if (inkWasNear)
      try {
        ctx.ui.hidePrompt('ink');
      } catch {}
    inkWasNear = inkNear;
    if (halo) {
      const elapsed = ctx.time.elapsed;
      halo.rotation.y = elapsed * 0.12;
      halo.rotation.x = Math.sin(elapsed * 0.3) * 0.06;
      halo.position.y = ruins.grand.pos.y + 8.6 + Math.sin(elapsed * 0.5) * 0.25;
    }
    discoverT -= dt;
    if (discoverT <= 0) {
      discoverT = 0.25;
      discover();
    }
  };
  return {
    name: 'The Painted Aerie',
    center,
    radius: SKY_ISLAND.radius,
    spots,
    surfaceAt,
    isOnSky,
    update(dt) {
      try {
        frame(dt);
      } catch (err) {
        if (errors++ < 3) console.error('[sky] update failed', err);
      }
    },
    dispose() {
      offs.forEach((off) => off());
      chests?.dispose();
      ctx.scene.remove(group);
      for (const collider of colliders)
        try {
          ctx.colliders.unregister(collider);
          ctx.physics.removeCollider(collider, false);
        } catch {}
      for (const mesh of [built.rock, built.stone, built.glass]) mesh?.geometry.dispose();
      halo?.geometry.dispose();
      water?.dispose();
      flora?.dispose();
      clouds?.dispose();
      mats.dispose();
      vit.texture.dispose();
      for (const realm of realms)
        try {
          realm.dispose();
        } catch {}
    },
  };
}
