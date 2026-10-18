/**
 * Everyone else here, as heroes. orb.visitors carries each player's pose (the hero's, see
 * character/double.js, with `looks`: what they wear from the wardrobe) and gives them name tags; each
 * visitor is drawn as a HeroDouble played from that pose, in their scarf, hood and glider. They're
 * moved in the frame loop on real time, so they go on while you're in the pause menu: the nearest
 * every frame, the rest every few frames, and nobody past FAR (their name tag has faded long before).
 */
import * as THREE from 'three';
import { HeroDouble, heroPose } from '../character/double.js';
import { CYCLE_SPEED, gliderCanopy, hoodColors, lookOf, scarfColors, wornOf } from './wardrobe.js';

const EVERY_FRAME = 8; // the nearest this many, within NEAR metres
const NEAR = 45;
const FAR = 160;
const num = (n) => (Number.isFinite(n) ? n : 0);

export function showVisitors(ctx) {
  const visitors = window.orb?.visitors;
  if (!visitors || !ctx.player?.state) return null;
  const readPose = heroPose(ctx.player.state);
  const handle = visitors.show({
    THREE,
    scene: ctx.scene,
    camera: ctx.camera,
    height: 1.7,
    pose: () => {
      const pose = readPose();
      const looks = ctx.wardrobe?.looks;
      if (pose && looks) pose.looks = looks;
      return pose;
    },
    // What Orb places by each name tag: nothing to see, the hero is drawn and moved below.
    avatar: () => new THREE.Group(),
  });
  const heroes = new Map(); // visitor id → { v, double, looks, scarf, phase, sinceTint, d, frames, dt }
  let warned = false;
  const fail = (err) => {
    if (!warned) console.warn('[orb] a visitor’s hero failed', err);
    warned = true;
  };
  const add = (v) => {
    const double = new HeroDouble(ctx);
    ctx.scene.add(double.group);
    return { v, double, looks: null, scarf: null, phase: Math.random(), sinceTint: 0, d: 0, frames: 0, dt: 0 };
  };
  const wear = (h, dt) => {
    const looks = typeof h.v.looks === 'string' ? h.v.looks : '';
    if (looks !== h.looks) {
      h.looks = looks;
      const worn = wornOf(looks);
      h.scarf = worn.scarf;
      h.double.setScarf(scarfColors(worn.scarf, h.phase));
      h.double.setHood(hoodColors(worn.hood));
      h.double.setGlider(gliderCanopy(worn.glider));
      h.sinceTint = 0;
    } else if (lookOf(h.scarf)?.cycle) {
      h.phase = (h.phase + dt * CYCLE_SPEED) % 1;
      h.sinceTint += dt;
      if (h.sinceTint < 1 / 30) return;
      h.sinceTint = 0;
      h.double.setScarf(scarfColors(h.scarf, h.phase));
    }
  };
  const update = (dt) => {
    const list = handle.list;
    const here = new Set();
    for (const v of list) {
      here.add(v.id);
      if (!heroes.has(v.id))
        try {
          heroes.set(v.id, add(v));
        } catch (err) {
          fail(err);
        }
    }
    for (const [id, h] of heroes)
      if (!here.has(id)) {
        h.double.dispose();
        heroes.delete(id);
      }
    const cam = ctx.camera.position;
    const order = [...heroes.values()];
    for (const h of order) h.d = Math.hypot(num(h.v.x) - cam.x, num(h.v.z) - cam.z);
    order.sort((a, b) => a.d - b.d);
    order.forEach((h, i) => {
      const shown = !h.failed && h.d < FAR;
      h.double.group.visible = shown;
      if (!shown) return;
      h.dt += dt;
      if (++h.frames < (i < EVERY_FRAME && h.d < NEAR ? 1 : 3)) return;
      try {
        wear(h, h.dt);
        h.double.drive(h.v, h.dt);
      } catch (err) {
        h.failed = true;
        h.double.group.visible = false;
        fail(err);
      }
      h.frames = 0;
      h.dt = 0;
    });
  };
  return {
    handle,
    heroes,
    update,
    /** A throw of theirs (the paint itself comes through orb/multiplayer.js). */
    flick(id, origin, velocity) {
      heroes.get(id)?.double.flick(origin, velocity);
    },
  };
}
