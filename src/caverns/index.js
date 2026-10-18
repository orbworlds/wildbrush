/**
 * Glowcap Caverns system: builds the cave, flora, glow and puzzles, registers the interior, places hints and chests, spawns the enemies and the Gloomwarden, and runs the awakening wave, warps and safety checks.
 */
import { CircleGeometry, Color, Group, Mesh, Vector3 } from 'three';
import { COLLISION_GROUPS, PALETTE } from '../core/config.js';
import { clamp } from '../core/math.js';
import { SkyChests } from '../shared/chests.js';
import { Hints } from '../shared/hints.js';
import { Motes } from '../shared/motes.js';
import { ParticleMode, Particles } from '../shared/particles.js';
import { bakeGeometry, buildCave, timing } from './carve.js';
import { buildEntrance } from './entrance.js';
import { buildFlora } from './flora.js';
import { addMushroom, FungusBuilder, HUES } from './fungus.js';
import { GlowField } from './glow-field.js';
import {
  BOUNDS,
  CHAMBERS,
  CHASM,
  getChamber,
  MOUTH_EXIT,
  OX,
  OY,
  OZ,
  SHAFT,
  spotPos,
  SPOTS,
  toWorld,
} from './layout.js';
import { makeMaterials, makeStoneMaterial } from './materials.js';
import { addAltar, addHintStone, addSpiral, StoneBuilder } from './props.js';
import { BrazierPuzzle, ExitPortal, GiantGlowcap, GloomVeil, RootGate } from './puzzles.js';
import { makeUniforms } from './shaders.js';
const AREA_ID = 'glowcap';
const AREA_NAME = 'The Glowcap Caverns';
export async function create(ctx) {
  const tStart = performance.now();
  const quality = ctx.settings.quality;
  const flags = new Set((ctx.params.get('cave') ?? '').split(',').filter(Boolean));
  const lit = flags.has('lit');
  const root = new Group();
  root.name = 'glowcap-caverns';
  ctx.scene.add(root);
  const withScene = (scene) =>
    new Proxy(ctx, {
      get: (target, key) => (key === 'scene' ? scene : Reflect.get(target, key)),
    });
  const U = makeUniforms();
  const mats = makeMaterials(ctx, U);
  const stone = makeStoneMaterial(ctx, U, new Color(1, 0.8, 0.5));
  const build = buildCave(quality);
  const tField = performance.now();
  const flora = buildFlora(build, quality);
  build.finish(flora.emitters);
  const tFlora = performance.now();
  const addMesh = (geometry, material, label) => {
    const mesh = new Mesh(geometry, material);
    mesh.name = label;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    root.add(mesh);
    return mesh;
  };
  addMesh(build.geometry, mats.rock, 'glowcap-rock');
  addMesh(flora.fungus, mats.fungus, 'glowcap-fungus');
  addMesh(flora.crystals, mats.crystal, 'glowcap-crystals');
  for (const pool of flora.pools) {
    const geometry = new CircleGeometry(1, 40);
    geometry.rotateX(-Math.PI / 2);
    geometry.scale(pool.rx, 1, pool.rz);
    geometry.translate(pool.x, pool.y, pool.z);
    addMesh(geometry, mats.pool, 'glowcap-pool');
  }
  const colliders = [];
  const RAPIER = ctx.RAPIER;
  const FIX_INTERNAL_EDGES = RAPIER.TriMeshFlags?.FIX_INTERNAL_EDGES;
  {
    const positions = build.geometry.getAttribute('position').array;
    const indices = build.geometry.getIndex().array;
    for (const meshFlags of [FIX_INTERNAL_EDGES, undefined])
      try {
        const desc = RAPIER.ColliderDesc.trimesh(positions, indices, meshFlags);
        if (!desc) continue;
        desc.setCollisionGroups(COLLISION_GROUPS.terrain).setFriction(0.9);
        const collider = ctx.physics.createCollider(desc);
        ctx.colliders.register(collider, {
          kind: 'rock',
          surface: 'rock',
          object: root,
          data: {
            glowcap: true,
          },
        });
        colliders.push(collider);
        break;
      } catch (err) {
        if (meshFlags === undefined) console.error('[caverns] trimesh failed', err);
      }
  }
  for (const solid of flora.solids)
    try {
      const desc = RAPIER.ColliderDesc.cylinder(solid.hh, solid.r)
        .setTranslation(solid.x, solid.y, solid.z)
        .setCollisionGroups(COLLISION_GROUPS.static);
      const collider = ctx.physics.createCollider(desc);
      ctx.colliders.register(collider, {
        kind: solid.surface === 'wood' ? 'tree' : 'rock',
        surface: solid.surface,
        object: root,
      });
      colliders.push(collider);
    } catch (err) {
      console.warn('[caverns] solid collider failed', err);
    }
  const glow = new GlowField(ctx, U, quality === 'low' ? 2 : 3);
  const clusterGlow = new Map();
  for (const cluster of flora.clusters)
    if (cluster.zone !== 'mouth')
      clusterGlow.set(
        cluster,
        glow.add(
          'static',
          cluster.pos.clone().addScaledVector(cluster.nrm, 0.4),
          3 + cluster.r * 1.6,
          cluster.hue,
          cluster.giant ? 0.5 : 0.28,
          {
            lightOnly: true,
            i: cluster.giant ? 0.5 : 0.28,
          },
        ),
      );
  let particles = null;
  try {
    particles = new Particles(withScene(root), quality === 'low' ? 300 : 600);
  } catch (err) {
    console.warn('[caverns] particles failed', err);
  }
  let motes = null;
  try {
    const zones = CHAMBERS.map((chamber) => ({
      x: OX + chamber.x,
      y: OY + chamber.floor + 0.6,
      z: OZ + chamber.z,
      radius: Math.min(chamber.rx, chamber.rz) * 0.85,
      height: chamber.ry * 0.9,
      count: chamber.id === 'F' ? 90 : chamber.id === 'B' ? 60 : chamber.id === 'S' ? 14 : 30,
      color: chamber.id === 'C' || chamber.id === 'S' ? 10325247 : chamber.id === 'D' ? 16756848 : 7337438,
      size: 0.09,
      kind: chamber.id === 'D' ? 2 : 0,
    }));
    motes = new Motes(withScene(root), zones, Math.random, quality === 'low' ? 0.5 : 1);
    motes.uniforms.uIntensity.value = 0.55;
  } catch (err) {
    console.warn('[caverns] motes failed', err);
  }
  const play = (sound, position, volume = 1) => {
    try {
      ctx.audio.play(sound, {
        position,
        volume,
      });
    } catch {}
  };
  let cinematicT = 0;
  const cinematic = (eye, target, duration) => {
    try {
      if (ctx.enemies.alertedCount > 0 || ctx.player.isStub) return;
      const cam = eye.clone();
      const step = target.clone().sub(eye);
      const dist = step.length();
      step.normalize().multiplyScalar(0.4);
      for (let i = 0; i < dist - 1.5 && build.field.sample(cam.x, cam.y, cam.z) > -0.45; i += 0.4) cam.add(step);
      ctx.player.setControlEnabled(false);
      ctx.player.setCinematic({
        position: cam,
        target: target.clone(),
        blend: 0.9,
      });
      cinematicT = duration;
    } catch {}
  };
  const endCinematic = () => {
    try {
      ctx.player.setCinematic(null);
      ctx.player.setControlEnabled(true);
    } catch {}
  };
  const solved = (id, position) => {
    try {
      ctx.events.emit('puzzle:solved', {
        id,
        area: AREA_ID,
        position: position.clone(),
      });
    } catch {}
  };
  const staticStone = new StoneBuilder();
  const d2 = {
    ctx,
    root,
    build,
    glow,
    U,
    mats,
    stone,
    staticStone,
    particles,
    flora,
    colliders,
    solved,
    cinematic,
    play,
  };
  const braziers = new BrazierPuzzle(d2);
  const giant = new GiantGlowcap(d2);
  const veil = new GloomVeil(d2);
  const roots = new RootGate(d2);
  const exitA = new ExitPortal(
    d2,
    snapToGround(spotPos(SPOTS.exitA)),
    new Vector3(-0.7, 0, -0.7).normalize().negate(),
    {
      beam: false,
      active: true,
    },
  );
  const shortcut = new ExitPortal(d2, snapToGround(spotPos(SPOTS.shortcutEnd)), new Vector3(1, 0, 0), {
    beam: true,
    active: false,
  });
  function snapToGround(p) {
    const gy = build.groundY(p.x, p.z, p.y + 2.5, 8);
    if (gy !== null) p.y = gy;
    return p;
  }
  const hints = new Hints(ctx);
  const hintDefs = [
    [SPOTS.hintA, 'Ember paint glows in the dark. Throw it to light your way!', PALETTE.red.hex],
    [SPOTS.hintB, 'A giant glowcap dreams at the bottom of the chasm. Only Bloom can wake it.', PALETTE.green.hex],
    [SPOTS.hintC, 'The crystals hum of a hollow high above. Spring up the shaft!', PALETTE.yellow.hex],
    [SPOTS.hintD, 'Three braziers sleep. Wake them all with Ember and the stone door will roll away.', PALETTE.red.hex],
    [SPOTS.hintE, 'A veil of gloom seals the grotto. Its warden prowls this hollow.', 10325247],
  ];
  const glyphSpots = [];
  hintDefs.forEach(([spot, text], i) => {
    const pos = snapToGround(spotPos(spot));
    const chamber = getChamber(['A', 'B', 'C', 'D', 'E'][i]);
    const facing = Math.atan2(OX + chamber.x - pos.x, OZ + chamber.z - pos.z);
    const glyph = addHintStone(staticStone, pos.clone().add(new Vector3(0, -0.1, 0)), facing, i * 3.3);
    glyphSpots.push(glyph.clone().add(new Vector3(Math.sin(facing) * 0.7, 0.1, Math.cos(facing) * 0.7)));
    hints.add(pos, text, 3.2);
    try {
      const desc = RAPIER.ColliderDesc.cylinder(0.75, 0.42)
        .setTranslation(pos.x, pos.y + 0.75, pos.z)
        .setCollisionGroups(COLLISION_GROUPS.static);
      const collider = ctx.physics.createCollider(desc);
      ctx.colliders.register(collider, {
        kind: 'rock',
        surface: 'stone',
        object: root,
      });
      colliders.push(collider);
    } catch {}
  });
  hintDefs.forEach(([, , color], i) =>
    glow.add('static', glyphSpots[i], 2.8, new Color(color), 0.22, {
      i: 0.22,
    }),
  );
  {
    const spiralPos = snapToGround(toWorld(SHAFT.x, SHAFT.y0 + 1, SHAFT.z));
    addSpiral(staticStone, spiralPos);
    glow.add('static', spiralPos.clone().add(new Vector3(0, 0.4, 0)), 3.2, new Color(PALETTE.yellow.hex), 0.45, {
      i: 0.45,
    });
  }
  const altarPos = snapToGround(spotPos(SPOTS.grandChest));
  const altarH = 0.34;
  addAltar(staticStone, altarPos, altarH);
  try {
    const desc = RAPIER.ColliderDesc.cylinder(0.22000000000000003, 2.45)
      .setTranslation(altarPos.x, altarPos.y + altarH / 2 - 0.05, altarPos.z)
      .setCollisionGroups(COLLISION_GROUPS.static);
    const collider = ctx.physics.createCollider(desc);
    ctx.colliders.register(collider, {
      kind: 'structure',
      surface: 'stone',
      object: root,
    });
    colliders.push(collider);
  } catch {}
  {
    const ringAcc = new FungusBuilder();
    const ringCluster = flora.allocCluster(
      altarPos.clone().add(new Vector3(0, 0.4, 0)),
      new Vector3(0, 1, 0),
      3.2,
      HUES.cyan,
      'F',
    );
    ringCluster.base = 0.9;
    for (let i = 0; i < 22; i++) {
      const ang = (i / 22) * Math.PI * 2 + Math.sin(i * 7.3) * 0.08;
      const toPath = Math.atan2(OX + 7 - altarPos.x, OZ + 22 - altarPos.z);
      const rel = Math.atan2(Math.sin(ang - toPath), Math.cos(ang - toPath));
      if (Math.abs(rel) < 0.55) continue;
      const rad = 2.55 + (i % 3) * 0.18;
      const base = new Vector3(altarPos.x + Math.sin(ang) * rad, altarPos.y - 0.02, altarPos.z + Math.cos(ang) * rad);
      const size = 0.35 + ((i * 0.37) % 1) * 0.45;
      addMushroom(ringAcc, {
        base,
        up: new Vector3(Math.sin(ang) * 0.25, 1, Math.cos(ang) * 0.25).normalize(),
        yaw: ang,
        height: size * 1.1,
        capR: size * 0.5,
        hue: i % 4 == 0 ? HUES.amber : i % 3 == 0 ? HUES.pink : HUES.cyan,
        cluster: ringCluster.id,
        pivot: ringCluster.pos,
        spots: 3,
        seed: i * 1.7,
        segments: 10,
      });
    }
    addMesh(ringAcc.geometry(), mats.fungus, 'glowcap-altar-ring');
  }
  const altarGlow = glow.add('static', altarPos.clone().add(new Vector3(0, 1.4, 0)), 7, new Color(1, 0.8, 0.45), 0.55, {
    i: 0.55,
  });
  const stoneMesh = new Mesh(staticStone.geometry(), stone);
  stoneMesh.name = 'glowcap-stone';
  stoneMesh.matrixAutoUpdate = false;
  root.add(stoneMesh);
  const faceToward = (pos, x, z) => Math.atan2(OX + x - pos.x, OZ + z - pos.z);
  const chestDefs = [];
  {
    const inkPos = snapToGround(spotPos(SPOTS.inkChest));
    chestDefs.push({
      id: 'ink',
      kind: 'small',
      pos: inkPos,
      facing: faceToward(inkPos, -20, -27),
      loot: {
        ink: true,
      },
    });
    const heartPos = snapToGround(spotPos(SPOTS.heartChest));
    chestDefs.push({
      id: 'hearts',
      kind: 'small',
      pos: heartPos,
      facing: faceToward(heartPos, 10, -24),
      loot: {
        hearts: 20,
      },
    });
    const vesselPos = snapToGround(spotPos(SPOTS.vesselChest));
    chestDefs.push({
      id: 'heartOfColour',
      kind: 'vessel',
      pos: vesselPos,
      facing: faceToward(vesselPos, SHAFT.x, SHAFT.z),
      loot: {
        item: 'heartContainer',
      },
    });
    const grandPos = altarPos.clone().add(new Vector3(0, altarH, 0));
    chestDefs.push({
      id: 'lantern',
      kind: 'grand',
      pos: grandPos,
      facing: faceToward(grandPos, 7, 22),
      loot: {
        item: 'lantern',
      },
    });
    glow.add('static', vesselPos.clone().add(new Vector3(0, 1.2, 0)), 4.5, new Color(1, 0.85, 0.5), 0.4, {
      i: 0.4,
    });
  }
  let awakened = false;
  let chests = null;
  try {
    chests = new SkyChests(withScene(root), chestDefs, {
      sealed: false,
      lenses: [],
      particles,
      onOpened: (chest) => {
        if (chest.kind === 'grand') wake(false);
        else if (chest.kind === 'vessel')
          glow.flash(chest.pos.clone().add(new Vector3(0, 1.5, 0)), 8, new Color(1, 0.8, 0.5), 2.5, 1.5);
      },
    });
  } catch (err) {
    console.error('[caverns] chests failed', err);
  }
  let entrance = null;
  try {
    const tEntrance = performance.now();
    entrance = buildEntrance(ctx, mats.rockOut, mats.fungus, stone, flora, bakeGeometry);
    timing.entrance = Math.round(performance.now() - tEntrance);
    hints.add(entrance.hint, 'The deep places drink the light. Bring your own.', 3.4);
  } catch (err) {
    console.error('[caverns] entrance failed', err);
  }
  const exitPos = () => {
    let gy = 0;
    try {
      gy = ctx.terrain.heightAt(MOUTH_EXIT.x, MOUTH_EXIT.z);
    } catch {}
    return new Vector3(MOUTH_EXIT.x, gy + 0.3, MOUTH_EXIT.z);
  };
  const respawn = snapToGround(spotPos(SPOTS.arrive)).add(new Vector3(0, 0.25, 0));
  const lighting = lit
    ? {
        ambient: 0.55,
        ambientColor: 0x8a9ac0,
        sun: 0,
        fogColor: 0x0a0d16,
        fogDensity: 0.02,
      }
    : {
        ambient: 0.14,
        ambientColor: 0x7a8cc4,
        sun: 0,
        fogColor: 0x05070e,
        fogDensity: 0.034,
      };
  ctx.interiors.register({
    id: AREA_ID,
    name: AREA_NAME,
    kind: 'cave',
    subtitle: 'Bring your own light',
    bounds: BOUNDS,
    lighting,
    object: root,
    respawn: respawn.clone(),
    respawnFacing: SPOTS.arriveFacing,
    entrance: entrance ? entrance.mouth.clone() : undefined,
  });
  if (lit) U.uFill.value = 0.3;
  let spawned = false;
  let eliteId = -1;
  const spawnEnemies = () => {
    if (spawned) return;
    spawned = true;
    const enemies = ctx.enemies;
    if (!enemies || enemies.isStub) {
      veil.lift(true);
      return;
    }
    const spawns = [
      ['smudgeling', [-29, -2, 5], [-21, 6], {}],
      ['smudgeling', [-14.5, -2, 5.5], [-19, 8], {}],
      ['spitter', [-19, -2, -10.5], [-20, 2], {}],
      [
        'smudgeling',
        [-22.5, 1, -29],
        [-25, -22],
        {
          tier: 2,
        },
      ],
      [
        'smudgeling',
        [-16.5, 1, -24.5],
        [-24, -23],
        {
          tier: 2,
        },
      ],
      [
        'spitter',
        [-26, 1, -32],
        [-24, -23],
        {
          tier: 2,
        },
      ],
      ['smudgeling', [6.5, 2, -22.5], [1, -23.5], {}],
      ['smudgeling', [13.5, 2, -22], [3, -23.5], {}],
      [
        'brute',
        SPOTS.elite,
        [17, -4],
        {
          elite: {
            name: 'The Gloomwarden',
            element: 'blue',
          },
        },
      ],
    ];
    for (const [type, at, lookAt, opts] of spawns)
      try {
        const pos = snapToGround(spotPos(at)).add(new Vector3(0, 0.05, 0));
        const facing = Math.atan2(OX + lookAt[0] - pos.x, OZ + lookAt[1] - pos.z);
        const id = enemies.spawn(type, pos, {
          facing,
          tier: opts.tier,
          elite: opts.elite,
        });
        if (opts.elite) eliteId = id;
      } catch (err) {
        console.warn('[caverns] spawn failed', type, err);
      }
    if (eliteId < 0 && !veil.open) veil.lift(true);
  };
  let wakeT = -1;
  const grotto = getChamber('F');
  const wakeOrigin = toWorld(grotto.x, grotto.floor + 2, grotto.z);
  const wakeQueue = new Map();
  function wake(instant) {
    if (!awakened) {
      awakened = true;
      wakeT = instant ? 99 : 0;
      U.uWake.value.set(wakeOrigin.x, wakeOrigin.y, wakeOrigin.z, instant ? 400 : 0);
      if (instant) {
        U.uWakeAmt.value = 2.3;
        if (motes) motes.uniforms.uIntensity.value = 1.15;
      }
      for (const cluster of flora.clusters)
        if (instant) {
          cluster.awake = true;
          cluster.base = 1;
        } else wakeQueue.set(cluster, cluster.pos.distanceTo(wakeOrigin) / 16);
      roots.retract(instant);
      shortcut.activate();
      altarGlow.target = 1.1;
      if (!instant) {
        glow.flash(wakeOrigin, 16, new Color(0.4, 1, 0.9), 3, 2.5);
        play('shrine-complete', wakeOrigin, 0.9);
        setTimeout(() => {
          try {
            ctx.ui.toast('The Glowcap Caverns awaken', 'A path of sunlight opens in the grotto');
          } catch {}
        }, 1800);
      }
      try {
        if (entrance) ctx.paint.bloomVitality(entrance.mouth, 30, instant ? 0.1 : 5);
        entrance?.setAwake(1);
      } catch {}
    }
  }
  function finishWake() {
    wakeT = 99;
    U.uWake.value.w = 400;
    U.uWakeAmt.value = 2.3;
    if (motes) motes.uniforms.uIntensity.value = 1.15;
    for (const [cluster] of wakeQueue) {
      cluster.awake = true;
      cluster.base = 1.15;
      const src = clusterGlow.get(cluster);
      if (src) src.target = cluster.giant ? 0.9 : 0.55;
    }
    wakeQueue.clear();
  }
  const inCave = (p) => !!p && BOUNDS.containsPoint(p);
  const bloomAt = (pos) => {
    for (const cluster of flora.clusters)
      if (!(cluster.pos.distanceToSquared(pos) > (cluster.r + 1.6) ** 2) && ((cluster.pulse = 1), !cluster.awake)) {
        cluster.awake = true;
        cluster.base = 1.15;
        const src = clusterGlow.get(cluster);
        if (src) src.target = cluster.giant ? 0.9 : 0.6;
        glow.add(
          'mush',
          cluster.pos.clone().addScaledVector(cluster.nrm, 0.5),
          3.5 + cluster.r * 1.5,
          cluster.hue,
          0.45,
          {
            flash: 1.4,
          },
        );
        if (particles)
          for (let i = 0; i < 14; i++)
            particles.spawn({
              x: cluster.pos.x,
              y: cluster.pos.y + 0.2,
              z: cluster.pos.z,
              vx: (Math.random() - 0.5) * 2,
              vy: 1 + Math.random() * 1.5,
              vz: (Math.random() - 0.5) * 2,
              color: cluster.hue,
              size: 0.08 + Math.random() * 0.08,
              life: 1 + Math.random(),
              drag: 1.5,
              gravity: -0.3,
              mode: ParticleMode.Rise,
              bright: 2,
            });
      }
  };
  const unsubs = [];
  unsubs.push(
    ctx.events.on('paint:splat', (splat) => {
      try {
        if (!inCave(splat.position) || splat.surface === 'water') return;
        if (splat.color === 'red' || splat.color === 'blue')
          if (splat.surface === 'world')
            glow.paintSplat(splat.color, splat.position, splat.normal ?? new Vector3(0, 1, 0), splat.radius || 1.65);
          else
            glow.flash(
              splat.position,
              3.5,
              splat.color === 'red' ? new Color(1, 0.45, 0.15) : new Color(0.3, 0.6, 1),
              1.2,
              0.6,
            );
        braziers.onSplat(splat.color, splat.position, splat.radius || 1.65);
        giant.onSplat(splat.color, splat.position);
        if (splat.color === 'green') bloomAt(splat.position);
      } catch (err) {
        console.warn('[caverns] splat handler failed', err);
      }
    }),
    ctx.events.on('combat:art-impact', (impact) => {
      try {
        if (!inCave(impact.position)) return;
        if (impact.art === 'fireball') {
          glow.flash(impact.position, 12, new Color(1, 0.5, 0.2), 3.2, 1.4);
          braziers.bowls.forEach((bowl, i) => {
            if (bowl.distanceTo(impact.position) < 3.6) braziers.ignite(i);
          });
        } else if (impact.art === 'iceLance') glow.flash(impact.position, 6, new Color(0.4, 0.7, 1), 1.2, 0.8);
        else if (impact.art === 'vineLash') {
          giant.onSplat('green', impact.position);
          bloomAt(impact.position);
        }
      } catch (err) {
        console.warn('[caverns] art handler failed', err);
      }
    }),
    ctx.events.on('interior:enter', (data) => {
      if (data.id === AREA_ID && (spawnEnemies(), !announced)) {
        announced = true;
        try {
          ctx.events.emit('area:enter', {
            id: AREA_ID,
            name: AREA_NAME,
            subtitle: 'Bring your own light',
          });
        } catch {}
      }
    }),
    ctx.events.on('elite:defeated', (data) => {
      if (data.id === eliteId) setTimeout(() => veil.lift(false), 1200);
    }),
    ctx.events.on('game:ready', () => precompile()),
  );
  let announced = false;
  let precompiled = false;
  function precompile() {
    if (!precompiled) {
      precompiled = true;
      try {
        const visible = root.visible;
        root.visible = true;
        const renderer = ctx.renderer;
        if (renderer.compileAsync) renderer.compileAsync(root, ctx.camera, ctx.scene).catch(() => undefined);
        else renderer.compile(root, ctx.camera, ctx.scene);
        root.visible = visible;
      } catch (err) {
        console.warn('[caverns] precompile failed', err);
      }
    }
  }
  if (flags.has('bridge') || flags.has('woke')) giant.wake(true);
  if (flags.has('door') || flags.has('woke')) for (let i = 0; i < 3; i++) braziers.ignite(i, true);
  if (flags.has('veil') || flags.has('woke')) veil.lift(true);
  if (flags.has('woke')) {
    wake(true);
    chests?.openInstant('lantern');
  }
  if (lit)
    for (const cluster of flora.clusters) {
      cluster.awake = true;
      cluster.base = 1;
    }
  const warp = ctx.params.get('warp') ?? '';
  const warpSpots = {
    glowcap: [SPOTS.arrive, SPOTS.arriveFacing],
    'glowcap-b': [SPOTS.chasmSouth, Math.PI],
    'glowcap-bridge': [SPOTS.chasmSouth, Math.PI],
    'glowcap-c': [[-24, 1, -23], Math.atan2(4, -4)],
    'glowcap-shaft': [[-14.5, 1, -30.5], Math.atan2(1.5, -2.5)],
    'glowcap-s': [[-9, 7.5, -33], Math.PI / 2],
    'glowcap-d': [[3, 2, -23.5], Math.PI / 2],
    'glowcap-door': [[10, 2, -21], 0],
    'glowcap-e': [[18.5, 0.5, -2.5], Math.atan2(5, 7)],
    'glowcap-end': [SPOTS.endWarp, Math.atan2(0, 1)],
    'glowcap-f': [SPOTS.endWarp, Math.atan2(0, 1)],
  };
  const applyWarp = () => {
    try {
      if (warp === 'glowcap-mouth') {
        ctx.player.teleport(exitPos().add(new Vector3(-3, 0, 0)), Math.PI / 2);
        return;
      }
      const spot = warpSpots[warp];
      if (!spot) return;
      const pos = snapToGround(spotPos(spot[0])).add(new Vector3(0, 0.3, 0));
      ctx.player.teleport(pos, spot[1]);
    } catch (err) {
      console.warn('[caverns] warp failed', err);
    }
  };
  let warpDelay = warp.startsWith('glowcap') ? 4 : 0;
  if (warpDelay) unsubs.push(ctx.events.on('game:start', applyWarp));
  console.info(`[caverns] built in ${(performance.now() - tStart).toFixed(0)}ms`, {
    field: Math.round(tField - tStart),
    bake: Math.round(tFlora - tField),
    tris: build.tris,
    clusters: flora.clusters.length,
    emitters: flora.emitters.length,
  });
  if (ctx.shotMode || ctx.debug)
    globalThis.__wbCave = {
      build,
      flora,
      glow,
      U,
      root,
      braziers,
      giant,
      veil,
      roots,
      chests,
      entrance,
      exitA,
      shortcut,
      get eliteId() {
        return eliteId;
      },
      wake,
      buildMs: Math.round(performance.now() - tStart),
      fieldMs: Math.round(tField - tStart),
      floraBakeMs: Math.round(tFlora - tField),
      timing,
    };
  let errors = 0;
  let traveling = false;
  let prompting = false;
  let chasmT = 0;
  let fallT = 0;
  let eliteCheckT = 1;
  let eliteGone = 0;
  let stuckT = 0;
  let safeT = 0;
  const safePos = respawn.clone();
  let lastInsideAt = -99;
  let dripT = 0;
  const splashes = [];
  const dripColor = new Color(0.55, 0.9, 1);
  const travel = (pos, facing) => {
    if (!traveling) {
      traveling = true;
      ctx.interiors
        .travel(pos, facing)
        .catch(() => undefined)
        .finally(() => {
          traveling = false;
        });
    }
  };
  const setPrompt = (show) => {
    if (show !== prompting) {
      prompting = show;
      try {
        if (show) ctx.ui.showPrompt('glowcap', 'Enter the Glowcap Caverns', 'F');
        else ctx.ui.hidePrompt('glowcap');
      } catch {}
    }
  };
  const tick = (dt) => {
    if (warpDelay > 0 && --warpDelay === 0) applyWarp();
    const realDt = ctx.time.realDt;
    const state = ctx.player?.state;
    const pos = state?.position ?? null;
    const inside = ctx.interiors.current?.id === AREA_ID;
    if (cinematicT > 0) {
      cinematicT -= realDt;
      if (cinematicT <= 0) endCinematic();
    }
    if (entrance) {
      const camDist = ctx.camera.position.distanceTo(entrance.mouth);
      entrance.group.visible = camDist < 260;
      if (
        pos &&
        !inside &&
        pos.distanceToSquared(entrance.mouth) < 1600 &&
        pos &&
        state &&
        !state.dead &&
        !ctx.player.isStub
      ) {
        hints.update();
        const canEnter = entrance.near(pos) && state.mode === 'ground' && !state.itemHold;
        setPrompt(canEnter && !traveling);
        if (!traveling && (entrance.inside(pos) || (canEnter && ctx.input.pressed('interact')))) {
          setPrompt(false);
          travel(respawn, SPOTS.arriveFacing);
        }
      } else setPrompt(false);
      const recent = ctx.time.elapsed - lastInsideAt < 4;
      if (
        !inside &&
        recent &&
        pos &&
        state &&
        state.mode !== 'fly' &&
        pos.y > 120 &&
        pos.y < BOUNDS.min.y &&
        Math.abs(pos.x - OX) < 42 &&
        Math.abs(pos.z - OZ) < 42
      ) {
        fallT += realDt;
        if (fallT > 0.3) {
          fallT = 0;
          travel(respawn, SPOTS.arriveFacing);
        }
      } else fallT = 0;
    }
    glow.update(dt, inside);
    if (!inside) {
      if (wakeT >= 0 && wakeT < 99) finishWake();
      return;
    }
    lastInsideAt = ctx.time.elapsed;
    if (!spawned) spawnEnemies();
    hints.update();
    particles?.update(dt);
    motes?.update(ctx);
    braziers.update(dt, true);
    giant.update(dt, true);
    veil.update(dt);
    roots.update(dt);
    chests?.update(dt, realDt, !ctx.player.isStub);
    if (pos && state && !state.dead && !traveling && !(chests?.busy ?? false)) {
      if (exitA.update(dt, pos) || shortcut.update(dt, pos)) travel(exitPos(), MOUTH_EXIT.facing);
    } else {
      exitA.update(dt, null);
      shortcut.update(dt, null);
    }
    if (pos && state && !state.dead && !traveling)
      if (build.field.sample(pos.x, pos.y + 0.9, pos.z) > 0.25) {
        stuckT += realDt;
        if (stuckT > 0.45) {
          stuckT = 0;
          travel(safePos.clone(), state.facing);
        }
      } else {
        stuckT = 0;
        safeT -= realDt;
        if (
          safeT <= 0 &&
          state.grounded &&
          state.mode === 'ground' &&
          build.field.sample(pos.x, pos.y + 0.9, pos.z) < -0.3
        ) {
          safeT = 0.5;
          safePos.copy(pos);
          safePos.y += 0.15;
        }
      }
    if (!veil.open && spawned && ((eliteCheckT -= dt), eliteCheckT <= 0)) {
      eliteCheckT = 1;
      let alive = false;
      try {
        alive = eliteId >= 0 && !!ctx.enemies.get(eliteId)?.alive;
      } catch {
        alive = false;
      }
      eliteGone = alive ? 0 : eliteGone + 1;
      if (eliteGone >= 5) veil.lift(false);
    }
    if (pos && state && !traveling) {
      const lx = pos.x - OX;
      const lz = pos.z - OZ;
      if (
        lx > CHASM.x0 &&
        lx < CHASM.x1 &&
        lz > CHASM.z0 &&
        lz < CHASM.z1 &&
        pos.y < OY + CHASM.floor + 1.6 &&
        state.mode !== 'climb'
      ) {
        chasmT += realDt;
        if (chasmT > 0.9) {
          chasmT = 0;
          const south = snapToGround(spotPos(SPOTS.chasmSouth)).add(new Vector3(0, 0.3, 0));
          travel(south, Math.PI);
        }
      } else chasmT = 0;
    }
    dripT -= dt;
    if (dripT <= 0 && particles && flora.tips.length) {
      dripT = 0.18 + Math.random() * 0.3;
      const tip = flora.tips[Math.floor(Math.random() * flora.tips.length)];
      const position = ctx.camera.position;
      const dx = tip.x - position.x;
      const dz = tip.z - position.z;
      if (dx * dx + dz * dz < 676) {
        const drop = Math.max(0.3, tip.y - tip.floor);
        const fallTime = Math.sqrt((2 * drop) / 9.8);
        particles.spawn({
          x: tip.x,
          y: tip.y,
          z: tip.z,
          vx: 0,
          vy: 0,
          vz: 0,
          color: dripColor,
          size: 0.05,
          life: fallTime,
          gravity: -9.8,
          mode: ParticleMode.Ballistic,
          bright: 1.2,
        });
        splashes.push({
          at: ctx.time.elapsed + fallTime,
          x: tip.x,
          y: tip.floor + 0.05,
          z: tip.z,
        });
      }
    }
    for (let i = splashes.length - 1; i >= 0; i--) {
      const splash = splashes[i];
      if (!(ctx.time.elapsed < splash.at) && (splashes.splice(i, 1), particles))
        for (let j = 0; j < 4; j++) {
          const ang = Math.random() * Math.PI * 2;
          particles.spawn({
            x: splash.x,
            y: splash.y,
            z: splash.z,
            vx: Math.cos(ang) * 0.7,
            vy: 1 + Math.random() * 0.8,
            vz: Math.sin(ang) * 0.7,
            color: dripColor,
            size: 0.03,
            life: 0.35,
            gravity: -9.8,
            mode: ParticleMode.Ballistic,
            bright: 1,
          });
        }
    }
    const elapsed = ctx.time.elapsed;
    if (wakeT >= 0 && wakeT < 99) {
      wakeT += dt;
      U.uWake.value.w = wakeT * 18;
      U.uWakeAmt.value = 1 + 1.3 * clamp(wakeT / 1.5, 0, 1);
      if (motes) motes.uniforms.uIntensity.value = 0.55 + 0.6 * clamp(wakeT / 3, 0, 1);
      for (const [cluster, delay] of wakeQueue)
        if (wakeT >= delay) {
          cluster.awake = true;
          cluster.base = 1.15;
          cluster.pulse = 1;
          const src = clusterGlow.get(cluster);
          if (src) src.target = cluster.giant ? 0.9 : 0.55;
          wakeQueue.delete(cluster);
          if (particles && cluster.pos.distanceToSquared(ctx.camera.position) < 1600) {
            const count = cluster.giant ? 26 : 7;
            for (let i = 0; i < count; i++) {
              const ang = Math.random() * Math.PI * 2;
              const rad = Math.random() * cluster.r * 0.6;
              particles.spawn({
                x: cluster.pos.x + Math.cos(ang) * rad,
                y: cluster.pos.y + 0.2,
                z: cluster.pos.z + Math.sin(ang) * rad,
                vx: Math.cos(ang) * 0.4,
                vy: 0.8 + Math.random() * 1.6,
                vz: Math.sin(ang) * 0.4,
                color: cluster.hue,
                size: 0.07 + Math.random() * 0.1,
                life: 1.6 + Math.random() * 1.6,
                drag: 0.8,
                gravity: 0.15,
                mode: ParticleMode.Rise,
                bright: 2.2,
              });
            }
          }
        }
      if (wakeT > 9) finishWake();
    }
    const uMushB = U.uMushB.value;
    for (const cluster of flora.clusters) {
      if (cluster.giant && cluster.zone === 'B' && !cluster.awake) continue;
      cluster.pulse = Math.max(0, cluster.pulse - dt / 6);
      const pulse = cluster.pulse;
      uMushB[cluster.id] =
        cluster.base +
        pulse * (0.8 + 0.5 * Math.sin(elapsed * 6 + cluster.id)) +
        (cluster.awake ? 0.08 * Math.sin(elapsed * 1.3 + cluster.id * 1.7) : 0);
    }
  };
  return {
    name: AREA_NAME,
    get completed() {
      return awakened;
    },
    update(dt) {
      try {
        tick(dt);
      } catch (err) {
        if (errors++ < 3) console.error('[caverns] update failed', err);
      }
    },
    dispose() {
      unsubs.forEach((off) => off());
      chests?.dispose();
      glow.dispose();
      entrance?.dispose();
      ctx.scene.remove(root);
      for (const collider of colliders)
        try {
          ctx.colliders.unregister(collider);
          ctx.physics.removeCollider(collider, false);
        } catch {}
      mats.dispose();
      stone.dispose();
      ctx.interiors.unregister(AREA_ID);
    },
  };
}
