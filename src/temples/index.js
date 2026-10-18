/**
 * Paint Temples system: creates the Kiln, the Frozen Cistern and their gates, routes paint splats and combat hits to the active temple, and handles the temple and warp URL parameters and the key counter.
 */
import { Vector3 } from 'three';
import { PALETTE } from '../core/config.js';
import { CisternTemple } from './cistern.js';
import { TempleGates } from './gates.js';
import { KeyHud } from './key-hud.js';
import { KilnTemple } from './kiln.js';
PALETTE.red.hex;
const ART_HIT_RADIUS = {
  fireball: 3.2,
  iceLance: 1.4,
  bounceOrb: 1.2,
  vineLash: 1.2,
};
export async function create(ctx) {
  const t0 = performance.now();
  const kiln = new KilnTemple(ctx);
  kiln.init();
  const cistern = new CisternTemple(ctx);
  cistern.init();
  const temples = [kiln, cistern];
  const gates = new TempleGates(ctx, [
    {
      temple: kiln,
      style: 'kiln',
      x: 3,
      z: 11,
      yaw: -0.1,
      hint: 'The Kiln: a forge of the first painters sleeps under the summit. Its heart still burns — bring Ember.',
    },
    {
      temple: cistern,
      style: 'cistern',
      x: -62,
      z: 64,
      yaw: 1.4,
      hint: 'The Frozen Cistern: the first painters kept their Frost beneath still water. Bring Frost — and a little Ember.',
    },
  ]);
  const keyHud = new KeyHud();
  const offs = [];
  const hitTemples = (color, pos, radius, kind) => {
    for (const temple of temples)
      if (temple.active)
        try {
          temple.hit(color, pos, radius, kind);
        } catch (err) {
          console.warn('[temples] hit failed', err);
        }
  };
  const swingPos = new Vector3();
  offs.push(
    ctx.events.on('paint:splat', (splat) => {
      if (splat && splat.color && splat.position && splat.surface !== 'enemy')
        hitTemples(splat.color, splat.position, Math.max(0.8, splat.radius ?? 1), 'splat');
    }),
    ctx.events.on('combat:art-impact', (impact) => {
      if (impact && impact.color && impact.position)
        hitTemples(impact.color, impact.position, ART_HIT_RADIUS[impact.art] ?? 1.2, 'art');
    }),
    ctx.events.on('combat:swing', (swing) => {
      if (swing && swing.color && swing.position && swing.direction) {
        swingPos.copy(swing.position).addScaledVector(swing.direction, 1.3);
        swingPos.y += 0.9;
        hitTemples(swing.color, swingPos, 1.2, 'swing');
      }
    }),
    ctx.events.on('combat:art', (cast) => {
      if (cast?.art === 'iceLance' && cistern.active) cistern.onLance(cast.origin, cast.direction);
    }),
    ctx.events.on('interior:enter', (interior) => {
      for (const temple of temples) if (interior?.id === temple.spec.id) temple.onEnter();
    }),
    ctx.events.on('player:death', () => {
      for (const temple of temples) temple.onPlayerDeath();
    }),
    ctx.events.on('player:respawn', (respawn) => {
      for (const temple of temples) temple.onPlayerRespawn(respawn?.position);
    }),
    ctx.events.on('enemy:death', (enemy) => {
      if (enemy) for (const temple of temples) temple.onEnemyDeath(enemy.id);
    }),
  );
  const templeFlags = ctx.params.get('temple') ?? '';
  if (templeFlags.includes('done')) {
    kiln.skipTo('done');
    cistern.skipTo('done');
  }
  if (templeFlags.includes('keys')) for (const temple of temples) temple.keys = Math.max(1, temple.keys);
  const warp = ctx.params.get('warp') ?? '';
  const warpStage = {
    'kiln-gallery': 'gallery',
    'kiln-hub': 'hub',
    'kiln-vent': 'hub',
    'kiln-ledge': 'hub',
    'kiln-guard': 'key',
    'kiln-boss': 'boss',
    'kiln-sanctum': 'sanctum',
    'kiln-done': 'done',
    'cistern-skate': 'skate',
    'cistern-hub': 'hub',
    'cistern-gallery': 'gallery',
    'cistern-guard': 'key',
    'cistern-boss': 'boss',
    'cistern-sanctum': 'sanctum',
    'cistern-done': 'done',
  };
  let warpFrames = 0;
  let warpTo = null;
  if (warp) {
    for (const temple of temples) {
      const spot = temple.spots()[warp === `${temple.spec.id}-done` ? `${temple.spec.id}-sanctum` : warp];
      if (spot) {
        if (warpStage[warp]) temple.skipTo(warpStage[warp]);
        warpTo = {
          pos: temple.kit.w(spot.x, spot.y, spot.z),
          facing: spot.facing,
        };
      }
      if (warp === `${temple.spec.id}-gate` && temple.exitTo)
        warpTo = {
          pos: temple.exitTo.pos
            .clone()
            .add(new Vector3(Math.sin(temple.exitTo.facing) * 5, 0, Math.cos(temple.exitTo.facing) * 5)),
          facing: temple.exitTo.facing + Math.PI,
        };
    }
    if (warpTo) {
      warpFrames = 5;
      offs.push(
        ctx.events.on('game:start', () => {
          if (warpTo) ctx.player.teleport(warpTo.pos.clone(), warpTo.facing);
        }),
      );
    }
  }
  window.__wbTemples = {
    kiln,
    cistern,
    gates,
    temples,
  };
  console.info(`[temples] ready in ${Math.round(performance.now() - t0)}ms`);
  let allDone = false;
  return {
    name: 'Paint Temples',
    get completed() {
      allDone ||= kiln.completed && cistern.completed;
      return allDone;
    },
    update(dt) {
      if (warpFrames > 0 && --warpFrames === 0 && warpTo)
        try {
          ctx.player.teleport(warpTo.pos.clone(), warpTo.facing);
        } catch {}
      let current = null;
      for (const temple of temples) {
        temple.update(dt);
        if (temple.active) current = temple;
      }
      try {
        gates.update(dt);
      } catch (err) {
        console.warn('[temples] gates failed', err);
      }
      keyHud.set(!!current, current?.keys ?? 0);
    },
    dispose() {
      for (const off of offs) off();
      keyHud.dispose();
    },
  };
}
