/**
 * Minimal stand-ins for every system, used when one is stubbed out from the URL or fails to start: plain lighting, a simple heightmap island, an orbit-camera player and so on.
 */
import {
  BufferAttribute,
  CapsuleGeometry,
  Color,
  DataTexture,
  DirectionalLight,
  FloatType,
  Fog,
  Group,
  HemisphereLight,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RedFormat,
  Vector2,
  Vector3,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BOSS_ARENA, COLLISION_GROUPS, DEFAULT_COLOR, LANDMARKS, SKY_ISLAND } from './config.js';
import { clamp, fbm, makeNoise2D, smoothstep } from './math.js';
function createEnvironmentStub(ctx) {
  const { scene, renderer, camera } = ctx;
  const skyColor = new Color(0x9cc7ea);
  scene.background = skyColor;
  scene.fog = new Fog(skyColor, 80, 420);
  const hemi = new HemisphereLight(0xcfe6ff, 0x6b5a45, 1.1);
  scene.add(hemi);
  const sun = new DirectionalLight(0xfff2dd, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const shadowCam = sun.shadow.camera;
  shadowCam.left = shadowCam.bottom = -60;
  shadowCam.right = shadowCam.top = 60;
  shadowCam.near = 1;
  shadowCam.far = 300;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  let tod = Number(ctx.params.get('tod') ?? 15);
  const env = {
    isStub: true,
    sun,
    get timeOfDay() {
      return tod;
    },
    setTimeOfDay(timeOfDay) {
      tod = ((timeOfDay % 24) + 24) % 24;
      const angle = ((tod - 6) / 12) * Math.PI;
      ctx.globals.uSunDir.value.set(Math.cos(angle) * 0.8, Math.max(0.08, Math.sin(angle)), 0.45).normalize();
    },
    daySpeed: 0,
    wind: {
      direction: new Vector2(0.8, 0.6).normalize(),
      strength: 0.5,
    },
    update(dt) {
      if (env.daySpeed) env.setTimeOfDay(tod + env.daySpeed * dt);
      const focus = ctx.player?.state.position ?? new Vector3();
      sun.position.copy(focus).addScaledVector(ctx.globals.uSunDir.value, 120);
      sun.target.position.copy(focus);
    },
    render() {
      renderer.render(scene, camera);
    },
    setSize(width, height) {
      renderer.setSize(width, height, false);
    },
    setInterior(interior) {
      hemi.intensity = interior ? 0.3 : 1.1;
      sun.intensity = interior ? 0 : 2.4;
    },
  };
  env.setTimeOfDay(tod);
  return env;
}
function createTerrainStub(ctx) {
  const noise = makeNoise2D('stub-terrain');
  const heights = new Float32Array(103041);
  const lm = LANDMARKS;
  const gauss = (x, z, cx, cz, sigma) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (2 * sigma * sigma));
  for (let i = 0; i < 321; i++)
    for (let j = 0; j < 321; j++) {
      const x = j - 160;
      const z = i - 160;
      const island = smoothstep(150, 118, Math.hypot(x, z) + fbm(noise, x * 0.01, z * 0.01, 3) * 18);
      let h = 5 + fbm(noise, x * 0.012 + 5, z * 0.012, 4) * 7;
      h += 58 * gauss(x, z, lm.summit.x, lm.summit.z, 30);
      h += 10 * gauss(x, z, lm.tower.x, lm.tower.z, 16);
      const mesaDist = Math.hypot(x - lm.mesa.x, z - lm.mesa.z);
      h = Math.max(h, 10 + 36 * smoothstep(16, 14, mesaDist));
      const lakeDist = Math.hypot(x - lm.lake.x, z - lm.lake.z);
      h = h * smoothstep(24, 40, lakeDist) + -5 * (1 - smoothstep(24, 40, lakeDist));
      h = Math.max(h, 3 * smoothstep(7, 4, lakeDist));
      h = island * h + (1 - island) * -12;
      heights[i * 321 + j] = h;
    }
  const heightAt = (x, z) => {
    const gx = clamp(x + 160, 0, 319.999);
    const gz = clamp(z + 160, 0, 319.999);
    const x0 = Math.floor(gx);
    const z0 = Math.floor(gz);
    const fx = gx - x0;
    const fz = gz - z0;
    const h00 = heights[z0 * 321 + x0];
    const h10 = heights[z0 * 321 + x0 + 1];
    const h01 = heights[(z0 + 1) * 321 + x0];
    const h11 = heights[(z0 + 1) * 321 + x0 + 1];
    return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
  };
  const normalAt = (x, z, target = new Vector3()) => {
    const eps = 0.5;
    return target
      .set(heightAt(x - eps, z) - heightAt(x + eps, z), 2 * eps, heightAt(x, z - eps) - heightAt(x, z + eps))
      .normalize();
  };
  const surfaceAt = (x, z) => (heightAt(x, z) < 1.6 ? 'sand' : normalAt(x, z).y < 0.75 ? 'rock' : 'grass');
  const geometry = new PlaneGeometry(320, 320, 320, 320);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const color = new Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const h = heightAt(x, z);
    position.setY(i, h);
    const surface = surfaceAt(x, z);
    color.set(surface === 'sand' ? 14272410 : surface === 'rock' ? 9077624 : 7316817);
    colors.set([color.r, color.g, color.b], i * 3);
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
  });
  ctx.paint.patchMaterial(material);
  const mesh = new Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.name = 'terrain-stub';
  ctx.scene.add(mesh);
  const fieldHeights = new Float32Array(103041);
  for (let i = 0; i < 321; i++) for (let j = 0; j < 321; j++) fieldHeights[i * 321 + j] = heights[j * 321 + i];
  const collider = ctx.physics.createCollider(
    ctx.RAPIER.ColliderDesc.heightfield(320, 320, fieldHeights, {
      x: 320,
      y: 1,
      z: 320,
    })
      .setCollisionGroups(COLLISION_GROUPS.terrain)
      .setFriction(0.9),
  );
  ctx.colliders.register(collider, {
    kind: 'terrain',
    surface: 'grass',
    object: mesh,
  });
  const heightTex = new DataTexture(heights, 321, 321, RedFormat, FloatType);
  heightTex.magFilter = heightTex.minFilter = LinearFilter;
  heightTex.needsUpdate = true;
  ctx.globals.uHeightMap.value = heightTex;
  ctx.globals.uHeightBounds.value.set(-160, -160, 320, 320);
  const landmarks = {};
  for (const [key, mark] of Object.entries(LANDMARKS))
    landmarks[key] = new Vector3(mark.x, heightAt(mark.x, mark.z), mark.z);
  return {
    isStub: true,
    size: 320,
    heightAt,
    normalAt,
    surfaceAt,
    grassDensityAt: (x, z) => +(surfaceAt(x, z) === 'grass'),
    landmarks,
    object: mesh,
  };
}
function createWaterStub(ctx) {
  const mesh = new Mesh(
    new PlaneGeometry(2400, 2400).rotateX(-Math.PI / 2),
    new MeshStandardMaterial({
      color: 0x2f8fb8,
      transparent: true,
      opacity: 0.78,
      roughness: 0.08,
      metalness: 0.1,
    }),
  );
  mesh.position.y = 0;
  mesh.name = 'water-stub';
  ctx.scene.add(mesh);
  return {
    isStub: true,
    level: 0,
    depthAt: (x, z) => Math.max(0, 0 - ctx.terrain.heightAt(x, z)),
    object: mesh,
  };
}
function createPaintStub(ctx) {
  const ink = {
    red: 100,
    blue: 100,
    yellow: 100,
    green: 100,
  };
  return {
    isStub: true,
    sample: (
      pos,
      out = {
        red: 0,
        blue: 0,
        yellow: 0,
        green: 0,
      },
    ) => {
      out.red = out.blue = out.yellow = out.green = 0;
      return out;
    },
    dominant: () => null,
    paintSphere() {},
    eraseSphere() {},
    throwBlob(start, velocity, color) {
      ctx.events.emit('paint:throw', {
        origin: start.clone(),
        velocity: velocity.clone(),
        color,
      });
      return true;
    },
    launchVelocity(start, end, target = new Vector3()) {
      const delta = end.clone().sub(start);
      const flightTime = clamp(Math.hypot(delta.x, delta.z) / 22, 0.25, 1.4);
      return target.set(delta.x / flightTime, delta.y / flightTime - -9.8 * flightTime, delta.z / flightTime);
    },
    showTrajectory() {},
    ink,
    inkMax: 100,
    addInk(color, amount) {
      ink[color] = clamp(ink[color] + amount, 0, 100);
    },
    vitalityAt: () => 1,
    bloomVitality() {},
    patchMaterial() {},
  };
}
function createVegetationStub() {
  return {
    isStub: true,
    treesNear: () => [],
    clearGrass() {},
  };
}
function createEnemiesStub() {
  return {
    isStub: true,
    spawn: () => -1,
    spawnCamp() {},
    get: () => undefined,
    query: () => [],
    damage: () => false,
    hitSphere: () => [],
    findLockTarget: () => null,
    alertedCount: 0,
    registerTarget() {},
    unregisterTarget() {},
  };
}
function createCavernsStub() {
  return {
    isStub: true,
    name: 'Glowcap Caverns',
    completed: false,
  };
}
function createTemplesStub() {
  return {
    isStub: true,
    name: 'Paint Temples',
    completed: false,
  };
}
function createSkyStub() {
  return {
    isStub: true,
    name: 'The Painted Aerie',
    center: new Vector3(SKY_ISLAND.x, SKY_ISLAND.y, SKY_ISLAND.z),
    radius: SKY_ISLAND.radius,
    spots: {},
    surfaceAt: () => null,
    isOnSky: () => false,
  };
}
function createBossStub(ctx) {
  return {
    isStub: true,
    name: 'Greymaw',
    arena: new Vector3(BOSS_ARENA.x, ctx.terrain.heightAt(BOSS_ARENA.x, BOSS_ARENA.z), BOSS_ARENA.z),
    active: false,
    defeated: false,
    health: 0,
    maxHealth: 1,
    phase: 0,
  };
}
function createElementsStub() {
  return {
    isStub: true,
    updraftAt: () => 0,
    isBurning: () => false,
    ignite() {},
    extinguish() {},
    freezeWater() {},
    addFlammable() {},
    spawnProp() {},
  };
}
export function createPlayerState() {
  return {
    mode: 'ground',
    position: new Vector3(),
    velocity: new Vector3(),
    facing: Math.PI,
    moveIntent: new Vector2(),
    speed: 0,
    sprinting: false,
    grounded: true,
    groundNormal: new Vector3(0, 1, 0),
    surface: 'grass',
    paintUnderfoot: null,
    wallNormal: new Vector3(0, 0, 1),
    climbInput: new Vector2(),
    stamina: 1,
    staminaMax: 1,
    exhausted: false,
    airTime: 0,
    waterDepth: 0,
    aiming: false,
    aimTarget: new Vector3(),
    selectedColor: DEFAULT_COLOR,
    lastJumpTime: -1,
    lastLandTime: -1,
    lastLandImpact: 0,
    lastBounceTime: -1,
    lastFlickTime: -1,
    lastClimbJumpTime: -1,
    health: 5,
    healthMax: 5,
    dead: false,
    invulnerable: false,
    lockTargetId: null,
    attack: null,
    charge: 0,
    lastAttackTime: -1,
    lastHurtTime: -1,
    lastDodgeTime: -1,
    dodgeDir: 'back',
    brush: 'wild',
    itemHold: null,
    artCharge: 0,
    lastArtTime: -1,
    outfit: 'classic',
    slowedUntil: -1,
  };
}
function createPlayerStub(ctx) {
  const state = createPlayerState();
  const items = new Set();
  const spawn = ctx.terrain.landmarks.spawn;
  state.position.copy(spawn);
  const orbitControls = new OrbitControls(ctx.camera, ctx.renderer.domElement);
  orbitControls.target.copy(spawn).add(new Vector3(0, 1.2, 0));
  ctx.camera.position.copy(spawn).add(new Vector3(0, 4, 9));
  orbitControls.enableDamping = true;
  orbitControls.update();
  return {
    isStub: true,
    state,
    teleport(position, facing) {
      state.position.copy(position);
      if (facing !== undefined) state.facing = facing;
    },
    cameraYaw: Math.PI,
    setControlEnabled() {},
    damage(hit) {
      if (state.dead || state.invulnerable) {
        return false;
      } else {
        state.health = Math.max(0, state.health - hit.amount);
        state.lastHurtTime = ctx.time.elapsed;
        ctx.events.emit('player:hurt', {
          amount: hit.amount,
          health: state.health,
          position: state.position.clone(),
          source: hit.source,
        });
        return true;
      }
    },
    giveItem(id) {
      items.add(id);
      if (id === 'heartContainer') state.health = state.healthMax += 1;
      if (id === 'chromaBrush') state.brush = 'chroma';
      ctx.events.emit('item:get', {
        item: id,
        position: state.position.clone(),
      });
    },
    hasItem: (id) => items.has(id),
    setCinematic() {},
    setInputHold() {},
    heal(amount) {
      const before = state.health;
      state.health = Math.min(state.healthMax, state.health + amount);
      ctx.events.emit('player:heal', {
        amount: state.health - before,
        health: state.health,
      });
    },
    lateUpdate() {
      orbitControls.update();
    },
  };
}
function createCharacterStub(ctx) {
  const group = new Group();
  const mesh = new Mesh(
    new CapsuleGeometry(0.35, 1, 6, 12),
    new MeshStandardMaterial({
      color: 0xe8d9b5,
    }),
  );
  mesh.position.y = 0.85;
  mesh.castShadow = true;
  group.add(mesh);
  ctx.scene.add(group);
  const state = ctx.player.state;
  return {
    isStub: true,
    object: group,
    brushTipWorld: (target) =>
      target.copy(state.position).add(new Vector3(Math.sin(state.facing) * 0.6, 1.5, Math.cos(state.facing) * 0.6)),
    headWorld: (target) => target.copy(state.position).setY(state.position.y + 1.6),
    lateUpdate() {
      group.position.copy(state.position);
      group.rotation.y = state.facing;
    },
  };
}
function createContentStub() {
  return {
    isStub: true,
    shrinesTotal: 4,
    shrinesComplete: 0,
  };
}
function createUiStub(ctx) {
  ctx.renderer.domElement.addEventListener('click', () => ctx.input.requestPointerLock());
  return {
    isStub: true,
    started: true,
    toast: (title, subtitle) => console.info(`[toast] ${title}${subtitle ? ' — ' + subtitle : ''}`),
    showPrompt() {},
    hidePrompt() {},
    fade: async () => {},
  };
}
function createAudioStub() {
  return {
    isStub: true,
    play() {},
  };
}
export const STUBS = {
  environment: createEnvironmentStub,
  paint: createPaintStub,
  terrain: createTerrainStub,
  water: createWaterStub,
  vegetation: createVegetationStub,
  elements: createElementsStub,
  enemies: createEnemiesStub,
  boss: createBossStub,
  sky: createSkyStub,
  caverns: createCavernsStub,
  temples: createTemplesStub,
  player: createPlayerStub,
  character: createCharacterStub,
  content: createContentStub,
  ui: createUiStub,
  audio: createAudioStub,
};
