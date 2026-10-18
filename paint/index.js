/**
 * Paint system (ctx.paint): the four inks and their regeneration, thrown blobs and what happens when they land (splats, splashes, sparkles, bloom), the trajectory preview, and the API for sampling, painting, erasing, vitality and patching materials.
 */
import { Color, Group, MathUtils, Vector2, Vector3 } from 'three';
import { COLORS, GRAVITY_Y, LANDMARKS, PALETTE } from '../core/config.js';
import { clamp } from '../core/math.js';
import { setShaderChunk } from '../core/shaders.js';
import { Ballistics, makeHit } from './ballistics.js';
import {
  BLOB_RADIUS,
  CHANNEL,
  CHANNEL_COLORS,
  PAINT_COLORS,
  SPLAT_RADIUS,
  VITALITY_MIN_X,
  VITALITY_MIN_Z,
  VITALITY_SIZE,
  VOLUME_MIN,
  VOLUME_SIZE,
} from './constants.js';
import { runPaintDemo } from './demo.js';
import { patchMaterial } from './patch-material.js';
import { buildNoiseTexture, buildPaintParsGlsl } from './shader.js';
import { Sparkles } from './sparkles.js';
import { DropKind, DropletRenderer, DropletSim, SplashRings } from './splash-fx.js';
import { Splatter } from './splatter.js';
import { TrajectoryPreview } from './trajectory.js';
import { VitalityMap } from './vitality.js';
import { PaintVolume } from './volume.js';
const MAX_BLOBS = 48;
const TRAJECTORY_STEP = 1 / 60;
const TRAJECTORY_TIME = 3.2;
export async function create(ctx) {
  const perfDefines = (ctx.params.get('paintperf') ?? '')
    .split(',')
    .filter(Boolean)
    .map((flag) => `#define WBP_${flag.toUpperCase()} 1`).join(`
`);
  setShaderChunk('wb_paint_pars', buildPaintParsGlsl(perfDefines));
  const volume = new PaintVolume();
  volume.init(ctx.renderer);
  const vitality = new VitalityMap();
  const globals = ctx.globals;
  globals.uPaintVolume.value = volume.texture;
  globals.uPaintVolumeMin.value.copy(VOLUME_MIN);
  globals.uPaintVolumeSize.value.copy(VOLUME_SIZE);
  globals.uVitalityMap.value = vitality.texture;
  globals.uVitalityBounds.value.set(VITALITY_MIN_X, VITALITY_MIN_Z, VITALITY_SIZE, VITALITY_SIZE);
  const uniforms = globals;
  uniforms.uWbBloomWaves = {
    value: vitality.waveUniform,
  };
  uniforms.uWbNoise3D = {
    value: buildNoiseTexture(),
  };
  const spawnXZ = new Vector2(LANDMARKS.spawn.x, LANDMARKS.spawn.z);
  vitality.restore(spawnXZ.x, spawnXZ.y, 32, 1, 0.4);
  vitality.init(ctx.renderer);
  let spawnChecked = false;
  const splatter = new Splatter(ctx, volume);
  const ballistics = new Ballistics(ctx);
  const dropletRenderer = new DropletRenderer(ctx);
  const droplets = new DropletSim();
  const rings = new SplashRings();
  const sparkles = new Sparkles(ctx);
  const trajectory = new TrajectoryPreview(ctx);
  const vfxGroup = new Group();
  vfxGroup.name = 'paint-vfx';
  vfxGroup.add(dropletRenderer.mesh, rings.mesh, sparkles.points, trajectory.group);
  ctx.scene.add(vfxGroup);
  const ink = {
    red: 100,
    blue: 100,
    yellow: 100,
    green: 100,
  };
  const blobs = [];
  const blobPool = [];
  const blobHit = makeHit();
  const sampleBuf = new Float32Array(4);
  const trajPoints = new Float32Array(582);
  const trajPos = new Vector3();
  const trajVel = new Vector3();
  const trajHit = makeHit();
  const tmpA = new Vector3();
  const tmpB = new Vector3();
  const tmpC = new Vector3();
  const sprayColor = new Color(0.8, 0.93, 1);
  let sinceThrow = 0;
  const perf = {
    splats: 0,
    splatMs: 0,
    uploads: 0,
    updateMs: 0,
    updateMaxMs: 0,
    lateMs: 0,
  };
  const up = new Vector3(0, 1, 0);
  const floorOut = new Vector3();
  const floorBelow = (pos) => {
    let ground = -1000000;
    try {
      if (ctx.terrain?.heightAt) ground = ctx.terrain.heightAt(pos.x, pos.z);
    } catch {}
    const waterLevel = ctx.water?.level ?? 0;
    return floorOut.set(pos.x, Math.max(ground, waterLevel), pos.z);
  };
  const isColor = (color) => typeof color == 'string' && color in PALETTE;
  const emitInkChanged = (color) =>
    ctx.events.emit('paint:ink-changed', {
      color,
      amount: ink[color],
    });
  const rand = (min, max) => min + Math.random() * (max - min);
  function spray(point, normal, velocity, color, count, energy = 1, kind = DropKind.Drop, floorNormal) {
    const tangential = tmpA.copy(velocity).addScaledVector(normal, -velocity.dot(normal));
    const tangentialSpeed = tangential.length();
    if (tangentialSpeed > 0.001) tangential.divideScalar(tangentialSpeed);
    const tangent = tmpB
      .copy(Math.abs(normal.y) < 0.9 ? tmpC.set(0, 1, 0) : tmpC.set(1, 0, 0))
      .cross(normal)
      .normalize();
    const bitangent = tmpC.crossVectors(normal, tangent);
    const dir = new Vector3();
    const vel = new Vector3();
    const start = new Vector3();
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spread = rand(0.45, 1.25);
      dir
        .copy(normal)
        .multiplyScalar(rand(0.55, 1.2))
        .addScaledVector(tangent, Math.cos(angle) * spread)
        .addScaledVector(bitangent, Math.sin(angle) * spread)
        .addScaledVector(tangential, Math.min(1.2, tangentialSpeed * 0.05))
        .normalize();
      const speed = rand(2.5, 7.5) * energy;
      vel.copy(dir).multiplyScalar(speed);
      start.copy(point).addScaledVector(normal, 0.12).addScaledVector(dir, 0.12);
      const radius = rand(0.035, 0.11) * (kind === DropKind.Water ? 0.85 : 1);
      droplets.spawn(kind, start, vel, radius, rand(0.45, 0.95), color, floorNormal ?? normal, point);
    }
  }
  const sparkColor = new Color();
  function inkSparkles(color, point, normal, count) {
    const paintColor = PAINT_COLORS[color];
    for (let i = 0; i < count; i++) {
      const ox = rand(-1, 1) * 1.2;
      const oz = rand(-1, 1) * 1.2;
      const x = point.x + ox + normal.x * 0.2;
      const y = point.y + normal.y * 0.2 + rand(0, 0.3);
      const z = point.z + oz + normal.z * 0.2;
      switch (color) {
        case 'red':
          sparkColor.setRGB(2.2, 0.92 * rand(0.7, 1.1), 0.18);
          sparkles.spawn(
            x,
            y,
            z,
            rand(-0.6, 0.6),
            rand(1, 2.6),
            rand(-0.6, 0.6),
            rand(0.07, 0.14),
            rand(0.9, 1.8),
            sparkColor,
            1,
            rand(0.8, 2.2),
          );
          break;
        case 'blue':
          sparkColor.setRGB(0.75, 0.92, 1.3);
          sparkles.spawn(
            x,
            y,
            z,
            rand(-0.4, 0.4),
            rand(0.2, 1),
            rand(-0.4, 0.4),
            rand(0.12, 0.22),
            rand(0.5, 1.1),
            sparkColor,
            0,
            -0.3,
          );
          break;
        case 'yellow':
          sparkColor.setRGB(1.4, 1.1, 0.35);
          sparkles.spawn(
            x,
            y,
            z,
            rand(-1.2, 1.2),
            rand(3, 5.5),
            rand(-1.2, 1.2),
            rand(0.1, 0.18),
            rand(0.7, 1.2),
            sparkColor,
            0,
            -9,
          );
          break;
        case 'green':
          sparkColor.setRGB(paintColor.r * 0.9 + 0.2, paintColor.g * 1.1 + 0.2, paintColor.b + 0.15);
          sparkles.spawn(
            x,
            y,
            z,
            rand(-0.5, 0.5),
            rand(0.4, 1.4),
            rand(-0.5, 0.5),
            rand(0.1, 0.2),
            rand(1, 1.8),
            sparkColor,
            2,
            0.4,
          );
      }
    }
  }
  function impact(blob, hit) {
    const now = performance.now();
    const paintColor = PAINT_COLORS[blob.color];
    let surface = 'world';
    if (hit.water) surface = 'water';
    else {
      const info = ctx.colliders.get(hit.handle);
      if (info?.kind === 'enemy') surface = 'enemy';
      else if (info?.dynamic) surface = 'prop';
    }
    const point = hit.point.clone();
    const normal = hit.normal.clone();
    const speed = hit.velocity.length();
    const energy = clamp(speed / 22, 0.5, 1.4);
    const glow = vitality.at(point.x, point.z) > 0.9 ? 0 : 0.22;
    if (surface === 'world') {
      splatter.splat(point, normal, hit.velocity, CHANNEL[blob.color], SPLAT_RADIUS);
      droplets.spawn(DropKind.Pancake, point, tmpA.set(0, 0, 0), SPLAT_RADIUS * 0.62, 0.16, paintColor, normal, point);
      spray(point, normal, hit.velocity, paintColor, 16, energy);
      inkSparkles(blob.color, point, normal, blob.color === 'red' ? 12 : 9);
      vitality.bloom(point.x, point.z, 7.5, 1.1, glow);
    } else if (surface === 'prop' || surface === 'enemy') {
      spray(point, normal, hit.velocity, paintColor, 22, energy * 1.2);
      inkSparkles(blob.color, point, normal, 8);
      vitality.bloom(point.x, point.z, 6, 1, glow);
    } else {
      const waterNormal = tmpB.set(0, 1, 0).clone();
      spray(point, waterNormal, hit.velocity, paintColor, 12, energy * 1.1, DropKind.Drop, waterNormal);
      spray(point, waterNormal, hit.velocity, sprayColor, 16, energy * 1.3, DropKind.Water, waterNormal);
      rings.spawn(point, waterNormal, 2.4, 4.2, paintColor, 0, 2);
      rings.spawn(point, waterNormal, 1.6, 0.55, paintColor, 0, 1);
      rings.spawn(point, waterNormal, 2.6, 1.1, paintColor, 0);
      rings.spawn(point, waterNormal, 4, 1.6, sprayColor, 0.14);
      rings.spawn(point, waterNormal, 5.6, 2.2, sprayColor, 0.34);
      inkSparkles(blob.color, point, waterNormal, 5);
      vitality.bloom(point.x, point.z, 6, 1, glow);
    }
    ctx.events.emit('paint:splat', {
      position: point,
      normal,
      color: blob.color,
      radius: SPLAT_RADIUS,
      surface,
      colliderHandle: hit.handle,
    });
    perf.splats++;
    perf.splatMs += performance.now() - now;
  }
  function updateBlobs(dt) {
    for (let i = blobs.length - 1; i >= 0; i--) {
      const blob = blobs[i];
      blob.age += dt;
      let remaining = dt;
      let landed = false;
      for (; remaining > 0.000001;) {
        const step = Math.min(remaining, 1 / 30);
        remaining -= step;
        if (ballistics.step(blob.p, blob.v, step, blobHit)) {
          landed = true;
          break;
        }
      }
      if (landed) {
        try {
          impact(blob, blobHit);
        } catch (err) {
          console.warn('[paint] impact failed', err);
        }
        blobs.splice(i, 1);
        blobPool.push(blob);
        continue;
      }
      if (blob.age > 6 || blob.p.y < VOLUME_MIN.y - 30) {
        blobs.splice(i, 1);
        blobPool.push(blob);
        continue;
      }
      blob.dropTimer -= dt;
      if (blob.dropTimer <= 0) {
        blob.dropTimer = rand(0.05, 0.12);
        tmpA
          .copy(blob.v)
          .multiplyScalar(0.92)
          .add(tmpB.set(rand(-1, 1), rand(-0.5, 1), rand(-1, 1)));
        droplets.spawn(
          DropKind.Drop,
          blob.p,
          tmpA,
          rand(0.03, 0.06),
          rand(0.35, 0.6),
          PAINT_COLORS[blob.color],
          up,
          floorBelow(blob.p),
        );
      }
    }
  }
  const blobDir = new Vector3();
  const trailPos = new Vector3();
  function renderBlobs(time) {
    for (const blob of blobs) {
      const color = PAINT_COLORS[blob.color];
      const speed = blob.v.length();
      if (speed > 0.001) blobDir.copy(blob.v).divideScalar(speed);
      else blobDir.set(0, 1, 0);
      const grow = Math.min(1, 0.45 + blob.age * 9);
      const stretch = 1 + Math.min(0.75, speed * 0.026);
      const radius = BLOB_RADIUS * grow;
      const wobble = 0.1 + 0.08 * Math.max(0, 1 - blob.age * 3);
      const tail = speed > 0.5 ? Math.min(speed * 0.03, 0.9, blob.age * speed * 0.8) : 0;
      const taper = tail / Math.max(radius * stretch, 0.001);
      dropletRenderer.push(
        blob.p,
        blobDir,
        radius / Math.sqrt(stretch),
        radius * stretch,
        color,
        wobble,
        blob.phase + time * 0.5,
        0,
        taper,
      );
      if (tail > 0.05)
        for (let i = 0; i < 2; i++) {
          const lag = (radius * stretch + tail + 0.08 + i * 0.16) / speed;
          if (lag > blob.age * 0.85) break;
          trailPos.copy(blob.p).addScaledVector(blob.v, -lag);
          trailPos.y += 0.5 * GRAVITY_Y * lag * lag;
          const sway = Math.sin(time * 19 + blob.phase + i * 2.1) * 0.035;
          trailPos.x += sway;
          trailPos.z -= sway * 0.6;
          const size = radius * (i ? 0.17 : 0.26);
          dropletRenderer.push(trailPos, blobDir, size, size * 1.5, color, 0.05, blob.phase + i, 0, 0.8);
        }
    }
  }
  const waveColor = new Color();
  function waveSparkles(dt) {
    vitality.forEachWave((x, z, radius, maxRadius, progress, glow) => {
      if (glow < 0.9 || maxRadius < 10 || radius < 1) return;
      let count = Math.min(200, 2 * Math.PI * radius * 0.7) * (1 - progress * 0.6) * dt;
      for (; count > 0 && !(count < 1 && Math.random() > count);) {
        --count;
        const angle = Math.random() * Math.PI * 2;
        const px = x + Math.cos(angle) * radius;
        const pz = z + Math.sin(angle) * radius;
        let py = 0;
        try {
          py = ctx.terrain?.heightAt ? ctx.terrain.heightAt(px, pz) : 0;
        } catch {
          py = 0;
        }
        const waterLevel = ctx.water?.level ?? 0;
        py = Math.max(py, waterLevel) + rand(0.1, 0.8);
        waveColor
          .setHSL((angle / (Math.PI * 2) + ctx.time.elapsed * 0.1 + Math.random() * 0.15) % 1, 0.95, 0.6)
          .multiplyScalar(2.2);
        const big = Math.random() < 0.25;
        sparkles.spawn(
          px,
          py,
          pz,
          rand(-0.4, 0.4),
          rand(0.8, 2.6),
          rand(-0.4, 0.4),
          big ? rand(0.45, 0.75) : rand(0.22, 0.45),
          rand(1, 2.2),
          waveColor,
          big ? 2 : 0,
          0.7,
        );
      }
    });
  }
  const api = {
    sample(
      pos,
      out = {
        red: 0,
        blue: 0,
        yellow: 0,
        green: 0,
      },
    ) {
      volume.sample(pos.x, pos.y, pos.z, sampleBuf);
      out.red = sampleBuf[CHANNEL.red];
      out.blue = sampleBuf[CHANNEL.blue];
      out.yellow = sampleBuf[CHANNEL.yellow];
      out.green = sampleBuf[CHANNEL.green];
      return out;
    },
    dominant(pos, threshold = 0.35) {
      volume.sample(pos.x, pos.y, pos.z, sampleBuf);
      let best = -1;
      let bestAmount = threshold;
      for (let i = 0; i < 4; i++)
        if (sampleBuf[i] > bestAmount) {
          bestAmount = sampleBuf[i];
          best = i;
        }
      return best >= 0 ? CHANNEL_COLORS[best] : null;
    },
    paintSphere(center, radius, color, strength = 1) {
      if (isColor(color) && center)
        try {
          splatter.sphere(center, clamp(radius, 0.05, 24), CHANNEL[color], clamp(strength, 0, 1));
        } catch (err) {
          console.warn('[paint] paintSphere failed', err);
        }
    },
    eraseSphere(center, radius, colors) {
      if (!center) return;
      let mask = 0;
      for (const color of colors ?? COLORS) if (isColor(color)) mask |= 1 << CHANNEL[color];
      if (mask)
        try {
          splatter.erase(center, clamp(radius, 0.05, 24), mask);
        } catch (err) {
          console.warn('[paint] eraseSphere failed', err);
        }
    },
    /** `remote`: another player's throw (orb/multiplayer.js): it spends none of your ink. */
    throwBlob(start, velocity, color, { remote = false } = {}) {
      if (!isColor(color) || !start || !velocity) return false;
      if (!remote) {
        if (ink[color] <= 0.01) {
          ctx.events.emit('paint:ink-empty', {
            color,
          });
          return false;
        }
        ink[color] = Math.max(0, ink[color] - 4);
        sinceThrow = 0;
        emitInkChanged(color);
      }
      const blob = blobPool.pop() ?? {
        p: new Vector3(),
        v: new Vector3(),
        color,
        age: 0,
        phase: 0,
        dropTimer: 0,
      };
      blob.p.copy(start);
      blob.v.copy(velocity);
      const speed = blob.v.length();
      if (!Number.isFinite(speed)) return false;
      if (speed > 48) blob.v.multiplyScalar(48 / speed);
      blob.color = color;
      blob.age = 0;
      blob.phase = Math.random() * 100;
      blob.dropTimer = 0.04;
      if (blobs.length >= MAX_BLOBS) blobPool.push(blobs.shift());
      blobs.push(blob);
      const paintColor = PAINT_COLORS[color];
      for (let i = 0; i < 4; i++) {
        tmpA
          .copy(blob.v)
          .multiplyScalar(rand(0.25, 0.6))
          .add(tmpB.set(rand(-1.5, 1.5), rand(-0.5, 2), rand(-1.5, 1.5)));
        droplets.spawn(
          DropKind.Drop,
          start,
          tmpA,
          rand(0.03, 0.06),
          rand(0.25, 0.5),
          paintColor,
          up,
          floorBelow(start),
        );
      }
      ctx.events.emit('paint:throw', {
        origin: start.clone(),
        velocity: blob.v.clone(),
        color,
        remote,
      });
      return true;
    },
    launchVelocity(start, end, target = new Vector3()) {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const dz = end.z - start.z;
      const g = -GRAVITY_Y;
      const horiz = Math.hypot(dx, dz);
      const dist = Math.hypot(horiz, dy);
      let flightTime = clamp(0.26 + horiz * 0.033, 0.22, 2.4);
      if (((time) => Math.hypot(dx / time, dy / time + 0.5 * g * time, dz / time))(flightTime) > 48) {
        const minTime = Math.sqrt((2 * dist) / g);
        flightTime = Math.max(flightTime, minTime);
      }
      target.set(dx / flightTime, dy / flightTime + 0.5 * g * flightTime, dz / flightTime);
      const speed = target.length();
      if (speed > 48) target.multiplyScalar(48 / speed);
      if (!Number.isFinite(target.x + target.y + target.z)) target.set(0, 5, 0);
      return target;
    },
    showTrajectory(start, velocity, color) {
      if (isColor(color) && start && velocity)
        try {
          trajPos.copy(start);
          trajVel.copy(velocity);
          const speed = trajVel.length();
          if (speed > 48) trajVel.multiplyScalar(48 / speed);
          let count = 0;
          trajPoints[0] = trajPos.x;
          trajPoints[1] = trajPos.y;
          trajPoints[2] = trajPos.z;
          count = 1;
          let landed = false;
          for (
            let time = 0;
            time < TRAJECTORY_TIME &&
            ((landed = ballistics.step(trajPos, trajVel, TRAJECTORY_STEP, trajHit)),
            (trajPoints[count * 3] = trajPos.x),
            (trajPoints[count * 3 + 1] = trajPos.y),
            (trajPoints[count * 3 + 2] = trajPos.z),
            count++,
            !(landed || trajPos.y < VOLUME_MIN.y - 30));
            time += TRAJECTORY_STEP
          );
          trajectory.show(
            trajPoints,
            count,
            PAINT_COLORS[color],
            landed ? trajHit.point : null,
            landed ? trajHit.normal : null,
            trajHit.water ? SPLAT_RADIUS * 1.1 : SPLAT_RADIUS,
          );
        } catch (err) {
          console.warn('[paint] showTrajectory failed', err);
        }
    },
    ink,
    inkMax: 100,
    addInk(color, amount) {
      if (!isColor(color) || !Number.isFinite(amount)) return;
      const before = ink[color];
      ink[color] = clamp(ink[color] + amount, 0, 100);
      if (ink[color] !== before) emitInkChanged(color);
    },
    vitalityAt(x, z) {
      return vitality.at(x, z);
    },
    bloomVitality(center, radius, duration = 2.6) {
      if (center && radius > 0) vitality.bloom(center.x, center.z, Math.min(radius, 400), clamp(duration, 0.1, 30), 1);
    },
    patchMaterial(material, options) {
      patchMaterial(ctx, material, options);
    },
    update(dt) {
      const now = performance.now();
      if (!spawnChecked && ctx.terrain?.landmarks?.spawn) {
        spawnChecked = true;
        const spawn = ctx.terrain.landmarks.spawn;
        if (Math.hypot(spawn.x - spawnXZ.x, spawn.z - spawnXZ.y) > 4) vitality.restore(spawn.x, spawn.z, 32, 1, 0.4);
      }
      trajectory.hide();
      if (dt > 0 && (updateBlobs(dt), splatter.update(dt), vitality.update(dt), (sinceThrow += dt), sinceThrow > 3))
        for (const color of COLORS)
          if (ink[color] < 20) {
            ink[color] = Math.min(20, ink[color] + dt * 1.5);
            if (Math.floor(ink[color]) !== Math.floor(ink[color] - dt * 1.5)) emitInkChanged(color);
          }
      const ms = performance.now() - now;
      perf.updateMs = perf.updateMs * 0.9 + ms * 0.1;
      perf.updateMaxMs = Math.max(perf.updateMaxMs * 0.995, ms);
    },
    lateUpdate(dt) {
      const now = performance.now();
      const elapsed = ctx.time.elapsed;
      droplets.update(dt, GRAVITY_Y);
      dropletRenderer.begin();
      renderBlobs(elapsed);
      droplets.render(dropletRenderer, elapsed);
      dropletRenderer.end();
      rings.update(dt);
      if (dt > 0) waveSparkles(dt);
      const canvasHeight = ctx.renderer.domElement.height || 720;
      sparkles.update(dt, canvasHeight / (2 * Math.tan(MathUtils.degToRad(ctx.camera.fov) / 2)));
      trajectory.update(ctx.time.realDt);
      try {
        perf.uploads = volume.flush(ctx.renderer);
        vitality.flush(ctx.renderer);
      } catch (err) {
        console.warn('[paint] GPU upload failed', err);
      }
      perf.lateMs = perf.lateMs * 0.9 + (performance.now() - now) * 0.1;
    },
    dispose() {
      ctx.scene.remove(vfxGroup);
    },
  };
  window.__wbPaint = {
    volume,
    vitality,
    splatter,
    perf,
    blobs,
    api,
  };
  if (ctx.debug)
    try {
      const folder = ctx.debug.addFolder('Paint');
      const actions = {
        demo: () => runPaintDemo(ctx, api),
        restoreAll: () => vitality.restore(0, 0, 400, 1, 0.01),
        drainAll: () => vitality.drain(0, 0, 400),
        bloomHere: () => api.bloomVitality(ctx.player.state.position, 60, 4),
        clearPaint: () => volume.clear(),
        refillInk: () => COLORS.forEach((color) => api.addInk(color, 100)),
      };
      folder.add(actions, 'demo');
      folder.add(actions, 'bloomHere');
      folder.add(actions, 'restoreAll');
      folder.add(actions, 'drainAll');
      folder.add(actions, 'clearPaint');
      folder.add(actions, 'refillInk');
      folder.close();
    } catch {}
  ctx.events.once('game:ready', () => {
    try {
      const objects = [
        dropletRenderer.mesh,
        rings.mesh,
        sparkles.points,
        trajectory.group,
        ...trajectory.group.children,
      ];
      const wasVisible = objects.map((obj) => obj.visible);
      objects.forEach((obj) => (obj.visible = true));
      ctx.renderer.compile(vfxGroup, ctx.camera, ctx.scene);
      objects.forEach((obj, i) => (obj.visible = wasVisible[i]));
    } catch (err) {
      console.warn('[paint] VFX precompile failed', err);
    }
  });
  const demoMode = ctx.params.get('paintdemo');
  if (demoMode)
    ctx.events.once('game:ready', () => {
      setTimeout(() => runPaintDemo(ctx, api, demoMode), 50);
    });
  return api;
}
