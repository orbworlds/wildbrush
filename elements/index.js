/**
 * Elements system: creates fire, flames, ice, props and effects, turns paint splats into burning, dousing, freezing and regrowth, and exposes ignite, extinguish, freezeWater, updraftAt and spawnProp to the other systems.
 */
import { Vector3 } from 'three';
import { clamp } from '../core/math.js';
import { setShaderChunk } from '../core/shaders.js';
import { BURN_PARS_GLSL } from './burn-glsl.js';
import { setupElementsDemo } from './demo.js';
import { FireSim } from './fire.js';
import { Flames } from './flames.js';
import { ElementFx } from './fx.js';
import { IceFloes } from './ice.js';
import { Glows, Puffs } from './particles.js';
import { Props } from './props.js';
import { fireBudget } from './util.js';
export async function create(ctx) {
  setShaderChunk('wb_burn_pars', BURN_PARS_GLSL);
  const budget = fireBudget(ctx.settings?.quality ?? 'high');
  const puffs = new Puffs(ctx, budget.puffs);
  const glows = new Glows(ctx, budget.glows);
  const fx = new ElementFx(puffs, glows);
  const flames = new Flames(ctx, budget.flames);
  ctx.scene.add(flames.mesh, puffs.mesh, glows.mesh);
  const fire = new FireSim(ctx, flames, fx, budget);
  ctx.globals.uBurnMap.value = fire.texture;
  ctx.globals.uBurnBounds.value.set(-160, -160, 320, 320);
  const ice = new IceFloes(ctx, fx);
  const props = new Props(ctx, fx, flames, fire, ice);
  const tmp = new Vector3();
  const sample = {
    red: 0,
    blue: 0,
    yellow: 0,
    green: 0,
  };
  const steamAt = (pos, scale = 1) => {
    fx.steam(pos.x, pos.y, pos.z, scale);
    ctx.events.emit('element:steam', {
      position: pos.clone(),
    });
  };
  const hasPaint = (pos, normal, color) => {
    const paint = ctx.paint;
    if (!paint || paint.isStub) return false;
    try {
      tmp.copy(pos);
      if (normal) tmp.addScaledVector(normal, 0.08);
      return paint.sample(tmp, sample)[color] > 0.3;
    } catch {
      return false;
    }
  };
  const nearGround = (pos) => {
    try {
      return pos.y - ctx.terrain.heightAt(pos.x, pos.z) < 6;
    } catch {
      return true;
    }
  };
  const onSplat = (splat) => {
    if (!splat || !splat.position) return;
    const position = splat.position;
    const radius = clamp(Number.isFinite(splat.radius) ? splat.radius : 1.2, 0.4, 6);
    const prop = props.byCollider(splat.colliderHandle);
    if (prop) {
      props.applyPaint(prop, splat.color, position, splat.normal);
      return;
    }
    if (ice.isIceCollider(splat.colliderHandle)) {
      if (splat.color === 'red') ice.meltCollider(splat.colliderHandle);
      else if (splat.color === 'blue') ice.freeze(position);
      return;
    }
    switch (splat.color) {
      case 'red': {
        if (splat.surface !== 'water' && hasPaint(position, splat.normal, 'blue')) {
          try {
            ctx.paint.eraseSphere(position, radius * 1.3, ['red', 'blue']);
          } catch {}
          steamAt(position, 1.2);
          return;
        }
        if (ice.meltAt(position, radius)) return;
        if (splat.surface === 'water') {
          fx.sizzle(position.x, position.y, position.z);
          steamAt(position, 0.5);
          return;
        }
        let lit = nearGround(position) ? fire.ignite(position, radius) : false;
        lit = props.igniteNear(position, radius) || lit;
        if (!lit) fx.sizzle(position.x, position.y, position.z);
        break;
      }
      case 'blue': {
        let erased = false;
        if (splat.surface !== 'water' && hasPaint(position, splat.normal, 'red')) {
          try {
            ctx.paint.eraseSphere(position, radius * 1.3, ['red', 'blue']);
          } catch {}
          erased = true;
        }
        let doused = nearGround(position) ? fire.extinguish(position, radius * 1.6 + 0.5) : false;
        doused = props.extinguishNear(position, radius + 0.5) || doused;
        if (doused || erased) steamAt(position, doused ? 1.2 + radius * 0.25 : 1);
        if (splat.surface === 'water' || (position.y < 0.6 && ice.isWater(position.x, position.z)))
          ice.freeze(position);
        break;
      }
      case 'green':
        if (nearGround(position) && fire.regrow(position, radius * 1.8 + 0.5))
          fx.bloom(position.x, position.y, position.z, radius * 1.8);
    }
  };
  ctx.events.on('paint:splat', onSplat);
  const api = {
    internals: {
      fire,
      ice,
      props,
      fx,
      flames,
    },
    updraftPeak: 24,
    updraftAt(pos) {
      if (!pos) return 0;
      try {
        const lift = fire.updraftAt(pos);
        return Number.isFinite(lift) ? lift : 0;
      } catch {
        return 0;
      }
    },
    isBurning(pos, radius = 1) {
      if (!pos) return false;
      try {
        return (nearGround(pos) && fire.isBurning(pos, radius)) || props.isBurningNear(pos, radius);
      } catch {
        return false;
      }
    },
    ignite(pos, radius = 1.5) {
      if (pos)
        try {
          ice.meltAt(pos, radius);
          if (nearGround(pos)) fire.ignite(pos, radius);
          props.igniteNear(pos, radius);
        } catch (err) {
          console.warn('[elements] ignite failed', err);
        }
    },
    extinguish(pos, radius = 2) {
      if (pos)
        try {
          let any = fire.extinguish(pos, radius);
          any = props.extinguishNear(pos, radius) || any;
          if (any) steamAt(pos, 0.8 + radius * 0.2);
        } catch (err) {
          console.warn('[elements] extinguish failed', err);
        }
    },
    freezeWater(pos, radius) {
      if (pos)
        try {
          ice.freeze(pos, radius ?? 2.2);
        } catch (err) {
          console.warn('[elements] freezeWater failed', err);
        }
    },
    addFlammable(flammable) {
      try {
        fire.addFlammable(flammable);
      } catch (err) {
        console.warn('[elements] addFlammable failed', err);
      }
    },
    spawnProp(kind, pos) {
      if (pos)
        try {
          props.spawn(kind, pos);
        } catch (err) {
          console.warn('[elements] spawnProp failed', err);
        }
    },
    update(dt) {
      props.update(dt);
      fire.update(dt);
      ice.update(dt);
    },
    lateUpdate(dt) {
      props.lateUpdate(dt);
      fx.flush();
    },
    dispose() {
      ctx.events.off('paint:splat', onSplat);
    },
  };
  try {
    setupElementsDemo(ctx, api);
  } catch (err) {
    console.warn('[elements] demo setup failed', err);
  }
  if (ctx.debug)
    try {
      const folder = ctx.debug.addFolder('Elements');
      const stats = {
        updraft: 0,
        burning: 0,
        floes: 0,
        props: 0,
      };
      const ahead = () =>
        ctx.player.state.position
          .clone()
          .add(new Vector3(Math.sin(ctx.player.state.facing) * 4, 0, Math.cos(ctx.player.state.facing) * 4));
      folder
        .add(
          {
            ignite: () => api.ignite(ahead(), 2),
          },
          'ignite',
        )
        .name('ignite ahead');
      folder
        .add(
          {
            extinguish: () => api.extinguish(ahead(), 4),
          },
          'extinguish',
        )
        .name('extinguish ahead');
      folder
        .add(
          {
            freeze: () => api.freezeWater(ahead()),
          },
          'freeze',
        )
        .name('freeze ahead');
      for (const kind of ['crate', 'barrel', 'boulder', 'ball'])
        folder
          .add(
            {
              [kind]: () => api.spawnProp(kind, ahead().add(new Vector3(0, 3, 0))),
            },
            kind,
          )
          .name(`spawn ${kind}`);
      folder.add(stats, 'updraft').listen().disable();
      folder.add(stats, 'burning').listen().disable();
      folder.add(stats, 'floes').listen().disable();
      folder.add(stats, 'props').listen().disable();
      setInterval(() => {
        stats.updraft = +api.updraftAt(ctx.player.state.position).toFixed(2);
        stats.burning = fire.burningCount;
        stats.floes = ice.count;
        stats.props = props.count;
      }, 250);
    } catch {}
  return api;
}
