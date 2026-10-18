/**
 * Scripted element showcases for the elementsdemo URL parameter (a burning dry meadow, a campfire, painted props, a lakeshore with ice floes and steam), with the camera framing used for screenshots.
 */
import { Vector2, Vector3 } from 'three';
import { DRY_MEADOW } from '../core/config.js';
export function setupElementsDemo(ctx, api) {
  const demo = ctx.params.get('elementsdemo');
  if (!demo) return;
  const terrain = ctx.terrain;
  const water = ctx.water;
  const heightAt = (x, z) => {
    try {
      const h = terrain.heightAt(x, z);
      return Number.isFinite(h) ? h : 0;
    } catch {
      return 0;
    }
  };
  const depthAt = (x, z) => {
    try {
      return water?.depthAt ? water.depthAt(x, z) : Math.max(0, 0 - heightAt(x, z));
    } catch {
      return 0;
    }
  };
  const v3 = (x, y, z) => new Vector3(x, y, z);
  const setCamera = (cam, look) => {
    api.demoCamera = {
      cam: cam.toArray(),
      look: look.toArray(),
    };
    if (ctx.shotMode && !ctx.params.has('cam')) {
      ctx.params.set(
        'cam',
        cam
          .toArray()
          .map((v) => v.toFixed(1))
          .join(','),
      );
      ctx.params.set(
        'look',
        look
          .toArray()
          .map((v) => v.toFixed(1))
          .join(','),
      );
    }
  };
  const spawn = terrain.landmarks?.spawn ?? v3(0, heightAt(0, 105), 105);
  const { props, fx, fire } = api.internals;
  const spawnProp = (kind, pos, color) => {
    const prop = props.spawn(kind, pos);
    if (prop && color) props.applyPaint(prop, color);
    return prop;
  };
  const timeline = [];
  const at = (time, fn) =>
    timeline.push({
      t: time,
      fn,
    });
  if (demo === 'meadow') {
    const x = DRY_MEADOW.x;
    const z = DRY_MEADOW.z;
    const y = heightAt(x, z);
    at(0.3, () => api.ignite(v3(x, y, z + 12), 2.5));
    at(0.3, () => api.ignite(v3(x - 8, heightAt(x - 8, z + 6), z + 6), 2));
    setCamera(v3(x + 4, y + 24, z + 62), v3(x, y + 6, z));
  } else if (demo === 'fire') {
    const base = v3(spawn.x, heightAt(spawn.x, spawn.z), spawn.z);
    at(0.3, () => api.ignite(v3(base.x, base.y, base.z - 2), 1.6));
    setCamera(v3(base.x + 0.5, base.y + 2.2, base.z + 7), v3(base.x, base.y + 1.1, base.z - 2));
  } else if (demo === 'props') {
    const base = v3(spawn.x, heightAt(spawn.x, spawn.z), spawn.z);
    at(0.3, () => {
      spawnProp('crate', v3(base.x - 3, base.y + 0.6, base.z), 'red');
      spawnProp('barrel', v3(base.x - 1, base.y + 3, base.z - 1), 'yellow');
      spawnProp('boulder', v3(base.x + 1.4, base.y + 0.8, base.z), 'green');
      spawnProp('ball', v3(base.x + 3.6, base.y + 0.7, base.z + 0.5), 'red');
      spawnProp('crate', v3(base.x + 0.2, base.y + 0.6, base.z + 2.4), 'blue');
      spawnProp('barrel', v3(base.x - 2.5, base.y + 0.6, base.z + 2.6), null);
      spawnProp('ball', v3(base.x + 2.2, base.y + 0.7, base.z + 2.8), null);
      spawnProp('boulder', v3(base.x - 4.5, base.y + 0.8, base.z + 2.2), null);
    });
    setCamera(v3(base.x + 1.5, base.y + 3.4, base.z + 9.5), v3(base.x, base.y + 0.6, base.z + 0.6));
  } else {
    const center = demo === 'ice' ? (terrain.landmarks?.lake ?? v3(-75, 0, 25)) : spawn;
    const isIce = demo === 'ice';
    const grassAt = (x, z) => {
      try {
        return terrain.grassDensityAt(x, z);
      } catch {
        return 1;
      }
    };
    const slopeAt = (x, z) =>
      Math.abs(heightAt(x + 2, z) - heightAt(x - 2, z)) + Math.abs(heightAt(x, z + 2) - heightAt(x, z - 2));
    const findLandBack = (shore, dir, maxDist) => {
      for (let i = 5; i < maxDist; i += 1) {
        const x = shore.x - dir.x * i;
        const z = shore.y - dir.y * i;
        if (grassAt(x, z) > 0.4 && slopeAt(x, z) < 0.8 && heightAt(x, z) > 0.6) return i + 3;
      }
      return -1;
    };
    let best = null;
    for (let i = 0; i < 72; i++) {
      const angle = (i / 72) * Math.PI * 2;
      const dx = Math.cos(angle);
      const dz = Math.sin(angle);
      for (let dist = 4; dist < 130; dist += 1) {
        const x = center.x + dx * dist;
        const z = center.z + dz * dist;
        const wet = depthAt(x, z) > 0.6;
        if (isIce ? !wet && dist > 12 : wet) {
          const dir = isIce ? new Vector2(-dx, -dz) : new Vector2(dx, dz);
          const shore = new Vector2(x, z);
          for (let k = 0; k < 40 && depthAt(shore.x, shore.y) > 0.05; k++) shore.addScaledVector(dir, -0.5);
          for (let k = 0; k < 40 && depthAt(shore.x, shore.y) <= 0.05; k++) shore.addScaledVector(dir, 0.5);
          const landBack = isIce ? 8 : findLandBack(shore, dir, 20);
          if (landBack > 0) {
            const score = dist * (isIce ? 1 : 0.25) + landBack;
            if (!best || score < best.score)
              best = {
                S: shore,
                D: dir,
                landBack,
                score,
              };
          }
          break;
        }
      }
    }
    const dir = best?.D ?? new Vector2(0, 1);
    const shore = best?.S ?? new Vector2(center.x, center.z + 20);
    const landBack = best?.landBack ?? 8;
    const side = new Vector2(-dir.y, dir.x);
    const shorePoint = (along, across, lift = 0) => {
      const x = shore.x + dir.x * along + side.x * across;
      const z = shore.y + dir.y * along + side.y * across;
      return v3(x, heightAt(x, z) + lift, z);
    };
    if (demo !== 'ice')
      at(0.3, () => {
        const back = landBack;
        spawnProp('crate', shorePoint(-back + 1.5, -5.5, 0.6), 'red');
        spawnProp('barrel', shorePoint(-back - 1, -3.2, 4.5), 'yellow');
        spawnProp('boulder', shorePoint(-back - 2.5, -7.2, 0.9), 'green');
        spawnProp('boulder', shorePoint(-back - 3.5, -1.2, 0.9), 'red');
        spawnProp('crate', shorePoint(-back + 0.5, -1.6, 0.6), 'blue');
        spawnProp('barrel', shorePoint(-back - 3, -5, 0.6), null);
        spawnProp('crate', shorePoint(-back - 1.2, -9.2, 0.6), null);
        spawnProp('crate', shorePoint(-back - 1.2, -9.2, 1.7), null);
        spawnProp('ball', shorePoint(-back - 4, -10.5, 0.7), null);
        api.ignite(shorePoint(-back - 1, 6), 2.2);
        api.ignite(shorePoint(-back - 5, 9), 1.5);
      });
    const floeCount = demo === 'ice' ? 7 : 6;
    for (let i = 0; i < floeCount; i++)
      at(0.35 + i * 0.12, () => {
        const along = 2 + i * (demo === 'ice' ? 3.5 : 2.4);
        const across = Math.sin(i * 1.7) * 0.9 + (demo === 'ice' ? 0 : 4.5 - i * 0.3);
        const pos = shorePoint(along, across);
        api.freezeWater(v3(pos.x, 0, pos.z));
      });
    for (let i = 0; i < 40; i++)
      at(1 + i * 2.4, () => {
        const pos = demo === 'ice' ? shorePoint(4, -5) : shorePoint(0.8, 6.5);
        pos.y = Math.max(pos.y, 0) + 0.2;
        fx.steam(pos.x, pos.y, pos.z, demo === 'ice' ? 1.3 : 0.9);
        ctx.events.emit('element:steam', {
          position: pos,
        });
      });
    let cam;
    let look;
    if (demo === 'ice') {
      look = shorePoint(6, 0, 0);
      look.y = 0.2;
      cam = shorePoint(-5, -7);
      cam.y = Math.max(cam.y + 1.8, 4.5);
    } else {
      look = shorePoint(-landBack * 0.6, -2.5, 0);
      look.y = Math.max(look.y, 0) + 0.4;
      cam = shorePoint(16, 1, 0);
      cam.y = Math.max(0, cam.y) + 6.5;
    }
    setCamera(cam, look);
    api.demoInfo = {
      shore: shore.toArray(),
      dir: dir.toArray(),
      landBack,
    };
  }
  let fired = 0;
  const baseUpdate = api.update?.bind(api);
  api.update = (dt) => {
    baseUpdate?.(dt);
    if (fired >= timeline.length) return;
    const elapsed = ctx.time.elapsed;
    for (const cue of timeline)
      if (cue.t <= elapsed && cue.t >= 0) {
        cue.t = -1;
        fired++;
        try {
          cue.fn();
        } catch (err) {
          console.warn('[elements demo]', err);
        }
      }
  };
}
