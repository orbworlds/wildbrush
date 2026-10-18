/**
 * Character system: builds the hero and its animator with ground and ledge probes, attaches the scarf, cape, vines, gear, glider and effects, turns combat, dodge and reward events into visuals, keeps the outfit in sync and updates it all each frame. Also drives a follow camera for the puppet stub.
 */
import { Color, MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { COLORS, GRAVITY_Y, PALETTE } from '../core/config.js';
import {
  CHROMA_BRUSH,
  FLURRY,
  flurryStroke,
  ITEM_HOLD,
  JUMP_SLASH,
  MASTERSTROKE_WINDOW,
  MOVES,
  SKY_MANTLE,
} from '../shared/combat-defs.js';
import { heroSignals } from '../shared/signals.js';
import { floorHeightAt } from '../shared/skyground.js';
import { AngleSpring } from './anim-math.js';
import { HeroAnimator } from './animator.js';
import { BRUSH_DIMS, classicHood, outfitScarf } from './body-mesh.js';
import { CapeCloth } from './cape.js';
import { ChromaBrush } from './chroma-brush.js';
import { ChromaWave } from './chroma-wave.js';
import { clothColliders, fitCape, fitScarf } from './cloth-fit.js';
import { HeroEffects } from './effects.js';
import { FlightFx } from './flight-fx.js';
import { HeroGear } from './gear.js';
import { HeroGhosts } from './ghosts.js';
import { CANOPIES, Glider } from './glider.js';
import { HeroModel } from './hero-model.js';
import { ItemGetFx } from './item-get-fx.js';
import { heroProbes } from './probes.js';
import { Puppet } from './puppet.js';
import { BrushRibbons } from './ribbons.js';
import { BONE } from './rig.js';
import { Scarf } from './scarf.js';
import { heroFade } from './toon-material.js';
import { VfxType } from './vfx.js';
import { HeroVines } from './vines.js';
export async function create(ctx) {
  const hero = new HeroModel(ctx);
  ctx.scene.add(hero.group);
  const playerState = () => ctx.player.state;
  const probes = heroProbes(ctx);
  const anim = new HeroAnimator(ctx, hero, probes.ground);
  anim.ledgeProbe = probes.ledge;
  window.__wbChar = {
    anim,
    hero,
  };
  let scarf = null;
  try {
    scarf = new Scarf(ctx, hero.mats.body);
    ctx.scene.add(scarf.mesh);
  } catch (err) {
    console.warn('[character] scarf disabled', err);
  }
  let cape = null;
  try {
    cape = new CapeCloth(ctx);
    ctx.scene.add(cape.mesh);
  } catch (err) {
    console.warn('[character] cape disabled', err);
  }
  let vines = null;
  try {
    vines = new HeroVines(ctx);
    hero.bones[BONE.shinL].add(vines.meshes[0]);
    hero.bones[BONE.shinR].add(vines.meshes[1]);
  } catch (err) {
    console.warn('[character] vines disabled', err);
  }
  ctx.events.on('item:get', (data) => {
    if (data?.item === 'skyMantle') hero.prepareOutfit('sky');
  });
  let gear = null;
  try {
    gear = new HeroGear(ctx, hero.bones, hero.mats.outlineWidth);
    gear.forceLight = ctx.params.get('lanternlight') === '1';
  } catch (err) {
    console.warn('[character] gear disabled', err);
  }
  const hasItem = (item) => {
    try {
      return !!ctx.player?.hasItem?.(item);
    } catch {
      return false;
    }
  };
  let glider = null;
  try {
    glider = new Glider(ctx);
    hero.group.add(glider.group);
  } catch (err) {
    console.warn('[character] glider disabled', err);
  }
  let fx = null;
  try {
    fx = new HeroEffects(ctx);
    ctx.scene.add(fx.vfx.mesh);
  } catch (err) {
    console.warn('[character] vfx disabled', err);
  }
  let ribbons = null;
  try {
    ribbons = new BrushRibbons(ctx);
    ctx.scene.add(ribbons.mesh);
  } catch (err) {
    console.warn('[character] ribbons disabled', err);
  }
  let ghosts = null;
  try {
    ghosts = new HeroGhosts(ctx, hero);
  } catch (err) {
    console.warn('[character] ghosts disabled', err);
  }
  let chromaBrush = null;
  let chromaWave = null;
  let itemFx = null;
  try {
    chromaBrush = new ChromaBrush(ctx, hero.mats.outlineWidth);
    ctx.scene.add(chromaBrush.group);
    chromaWave = new ChromaWave(ctx);
    ctx.scene.add(chromaWave.group);
  } catch (err) {
    console.warn('[character] chroma brush disabled', err);
  }
  try {
    itemFx = new ItemGetFx(ctx);
    ctx.scene.add(itemFx.group);
    itemFx.slotOf = (item, out) => {
      gear?.slotWorld(item, out);
    };
  } catch (err) {
    console.warn('[character] item fx disabled', err);
  }
  heroSignals(ctx).on('air-jump', (data) => {
    const state = playerState();
    if (!state.aiming && !state.attack && !state.dead) anim.triggerFlip('flip', 0.5);
    gear?.flap();
    if (data?.position) gear?.airJumpPuff(data.position, fx);
  });
  let flightFx = null;
  try {
    flightFx = new FlightFx(ctx);
    ctx.scene.add(flightFx.trail.mesh, flightFx.lines.mesh, flightFx.flare.mesh);
  } catch (err) {
    console.warn('[character] flight fx disabled', err);
  }
  let flightFxFailed = false;
  const floorAt = (x, z, fallback, y = Infinity) => {
    const floorY = floorHeightAt(ctx, x, z, y);
    return Number.isFinite(floorY) ? floorY : fallback;
  };
  let bodyOnly = false;
  let bodyOnlyGeo = null;
  const rewardState = {
    lastCharge: 0,
    seenSpin: -1,
    twinkleT: 0,
    waveSparkT: 0,
    revealAt: -1,
    lastHold: null,
  };
  const chromaShots = [];
  for (let i = 0; i < 10; i++)
    chromaShots.push({
      p: new Vector3(),
      v: new Vector3(),
      t: 0,
      k: 0,
      alive: false,
    });
  ctx.events.on('paint:throw', (data) => {
    if (!data || data.remote || playerState().brush !== 'chroma' || !data.origin || !data.velocity) return;
    const shot = chromaShots.find((chromaShot) => !chromaShot.alive) ?? chromaShots[0];
    shot.p.copy(data.origin);
    shot.v.copy(data.velocity);
    shot.t = 0;
    shot.k = Math.floor(Math.random() * 4);
    shot.alive = true;
  });
  ctx.events.on('paint:splat', (data) => {
    if (data?.position)
      for (const shot of chromaShots) if (shot.alive && shot.p.distanceToSquared(data.position) < 4) shot.alive = false;
  });
  const combatState = {
    lastStroke: -1,
    drainT: 0,
    drained: false,
    ghostT: 0,
    seenDodge: -1,
    seenImpact: -1,
    lastFlurryStroke: -2,
    victorySpark: false,
    flingT: 0,
  };
  const prevTip = new Vector3();
  const tipVel = new Vector3();
  const domElement = ctx.renderer.domElement;
  const setDrained = (on) => {
    if (combatState.drained !== on) {
      combatState.drained = on;
      try {
        domElement.style.transition = on ? 'filter 0.1s ease-out' : 'filter 0.45s ease-in';
        domElement.style.filter = on ? 'saturate(0.12) contrast(1.12) brightness(0.94)' : '';
      } catch {}
    }
  };
  const hitPos = new Vector3();
  ctx.events.on('combat:hit', (data) => {
    if (!fx || !data || !data.position) return;
    const state = playerState();
    const enemy = ctx.enemies.get(data.enemyId);
    const height = enemy ? enemy.height : 1.4;
    const radius = enemy ? enemy.radius : 0.4;
    hitPos.copy(data.position).setY(data.position.y + height * 0.5);
    let dx = hitPos.x - state.position.x;
    let dz = hitPos.z - state.position.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    hitPos.x -= dx * radius * 0.8;
    hitPos.z -= dz * radius * 0.8;
    const color = data.color ? PALETTE[data.color].hex : 16052714;
    const source = data.source;
    let power =
      source === 'jumpSlash' || source === 'spin'
        ? 1.6
        : source === 'flurry'
          ? 0.7
          : source === 'blob'
            ? 0.6
            : data.damage >= 1.4
              ? 1.4
              : 1;
    if (data.shatter) power = 2.2;
    try {
      fx.impact(hitPos, color, dx, dz, power, data.killed || !!data.shatter, data.position.y, ctx.camera.position);
      if (data.shatter) fx.sparkle(hitPos, 15136767, 22, 6);
    } catch {}
  });
  ctx.events.on('combat:perfect-dodge', () => {
    combatState.drainT = MASTERSTROKE_WINDOW;
    setDrained(true);
    ghosts?.spawn(16777215, 0.8, 0.6);
    const state = playerState();
    fx?.vfx.emit({
      type: 5,
      x: state.position.x,
      y: state.position.y + 1,
      z: state.position.z,
      size: 1.4,
      grow: 1.8,
      life: 0.25,
      color: 0xffffff,
      alpha: 1,
    });
    fx?.vfx.emit({
      type: 6,
      x: state.position.x,
      y: state.position.y + 1,
      z: state.position.z,
      size: 0.3,
      grow: 12,
      life: 0.4,
      color: PALETTE[state.selectedColor].hex,
      alpha: 1,
    });
  });
  ctx.events.on('combat:flurry', ({ active }) => {
    if (active) {
      combatState.drainT = 0;
      setDrained(false);
    }
  });
  ctx.events.on('player:death', () => setDrained(false));
  const scarfColliders = clothColliders(9);
  const tipWorld = new Vector3();
  anim.onFootPlant = (foot, intensity) => {
    const state = playerState();
    if (state.mode === 'ground') {
      try {
        fx?.footstep(_footFxPos.copy(foot.pos).setY(foot.pos.y - 0.088), state, intensity);
      } catch {}
      ctx.events.emit('character:footstep', {
        position: _footstepPos.copy(foot.pos).setY(foot.pos.y - 0.088),
        surface: state.surface,
        foot: foot.side === 1 ? 'left' : 'right',
        intensity,
      });
    }
  };
  anim.onGrab = (limb) => {
    const state = playerState();
    if (state.mode === 'climb')
      ctx.events.emit('character:footstep', {
        position: _footstepPos.copy(limb.pos),
        surface: state.surface,
        foot: limb.side === 1 ? 'left' : 'right',
        intensity: limb.isHand ? 0.35 : 0.25,
      });
  };
  const puppet = ctx.player.isStub ? new Puppet(ctx, ctx.player.state) : null;
  const followCam = puppet && ctx.params.get('follow') === '1';
  const followYaw = new AngleSpring(3);
  const followPos = new Vector3();
  const followLook = new Vector3();
  let followInit = false;
  let glideK = 0;
  let swimK = 0;
  const ribbonBase = new Vector3();
  const ghostColor = new Color();
  const updateCombatVisuals = (dt) => {
    const state = playerState();
    const cmb = anim.cmb;
    const elapsed = ctx.time.elapsed;
    const brushMatrix = hero.bones[BONE.brush].matrixWorld;
    tipWorld.copy(BRUSH_DIMS.tip).applyMatrix4(brushMatrix);
    const tipSpeed = dt > 0 ? tipWorld.distanceTo(prevTip) / dt : 0;
    tipVel.subVectors(tipWorld, prevTip).divideScalar(Math.max(dt, 0.0001));
    prevTip.copy(tipWorld);
    if (ribbons) {
      if (cmb.strokeLive && anim.brushInHand > 0.5) {
        if (
          (!ribbons.active || cmb.strokeId !== combatState.lastStroke) &&
          (tipSpeed > 4.5 || dt <= 0 || ribbons.active)
        ) {
          ribbons.begin(cmb.strokeColor, cmb.strokeWidth, elapsed, cmb.strokeRainbow);
          combatState.lastStroke = cmb.strokeId;
        }
        if (ribbons.active && combatState.lastStroke === cmb.strokeId) {
          ribbonBase.set(0, BRUSH_DIMS.tip.y - 0.5, 0.03).applyMatrix4(brushMatrix);
          ribbons.push(tipWorld, ribbonBase, elapsed);
        }
      } else if (ribbons.active) ribbons.end(elapsed);
      ribbons.update(elapsed);
    }
    if (fx && cmb.strokeLive && tipSpeed > 9 && dt > 0)
      for (combatState.flingT -= dt * Math.min(3, tipSpeed / 9) * 55; combatState.flingT <= 0;) {
        combatState.flingT += 1;
        const random = Math.random;
        fx.vfx.emit({
          type: 1,
          x: tipWorld.x,
          y: tipWorld.y,
          z: tipWorld.z,
          vx: tipVel.x * (0.25 + random() * 0.3) + (random() - 0.5) * 2,
          vy: tipVel.y * 0.3 + 1 + random() * 2.5,
          vz: tipVel.z * (0.25 + random() * 0.3) + (random() - 0.5) * 2,
          size: 0.025 + random() * 0.04,
          life: 0.9,
          color: cmb.strokeColor,
          gravity: -15,
          drag: 1.2,
          floor: anim.rootPos.y + 0.01,
        });
      }
    if (combatState.drainT > 0 && dt > 0) {
      combatState.drainT -= dt;
      if (combatState.drainT <= 0) setDrained(false);
    }
    if (dt <= 0) {
      ghosts?.update(0);
      return;
    }
    const paintHex =
      state.brush === 'chroma'
        ? PALETTE[COLORS[Math.floor(elapsed * 9) % 4]].hex
        : (PALETTE[state.selectedColor]?.hex ?? 16777215);
    if (fx && state.charge > 0) {
      tipWorld.copy(BRUSH_DIMS.tip).applyMatrix4(brushMatrix);
      fx.feet.set(state.position.x, anim.rootPos.y, state.position.z);
      fx.charge(tipWorld, paintHex, state.charge, dt, state.charge >= 1);
    }
    const attack = state.attack;
    if (fx && attack && (attack.move === 'slash3' || attack.move === 'jumpSlash')) {
      const impactT = attack.move === 'slash3' ? MOVES.slash3.impact : JUMP_SLASH.land;
      if (attack.t >= impactT && combatState.seenImpact !== state.lastAttackTime) {
        combatState.seenImpact = state.lastAttackTime;
        tipWorld.copy(BRUSH_DIMS.tip).applyMatrix4(brushMatrix);
        tipWorld.y = anim.rootPos.y;
        fx.slam(tipWorld, paintHex, attack.move === 'jumpSlash' ? 1.5 : 1);
      }
    }
    if (ghosts) {
      if (state.lastDodgeTime !== combatState.seenDodge) {
        combatState.seenDodge = state.lastDodgeTime;
        if (state.lastDodgeTime >= 0 && elapsed - state.lastDodgeTime < 0.2) ghosts.spawn(paintHex, 0.35, 0.3);
      }
      if (attack?.move === 'flurry') {
        combatState.ghostT -= dt;
        if (combatState.ghostT <= 0) {
          combatState.ghostT = 0.045;
          const stroke = Math.max(0, flurryStroke(attack.t));
          ghostColor.setHex(PALETTE[COLORS[stroke % 4]].hex);
          ghosts.spawn(ghostColor, 0.5, 0.28);
        }
        const stroke = flurryStroke(attack.t);
        if (fx && stroke !== combatState.lastFlurryStroke && stroke >= 0) {
          combatState.lastFlurryStroke = stroke;
          tipWorld.copy(BRUSH_DIMS.tip).applyMatrix4(brushMatrix);
          fx.sparkle(tipWorld, stroke >= FLURRY.count ? 16777215 : paintHex, 6, 3);
        }
      } else combatState.lastFlurryStroke = -2;
      ghosts.update(dt);
    }
    if (fx && cmb.action === 'victory' && cmb.actT > 1.02 && !combatState.victorySpark) {
      combatState.victorySpark = true;
      tipWorld.copy(BRUSH_DIMS.tip).applyMatrix4(brushMatrix);
      fx.sparkle(tipWorld, paintHex, 14, 2.5);
      fx.vfx.emit({
        type: 5,
        x: tipWorld.x,
        y: tipWorld.y,
        z: tipWorld.z,
        size: 0.6,
        grow: 1.6,
        life: 0.16,
        color: paintHex,
        alpha: 1,
      });
    } else if (cmb.action !== 'victory') combatState.victorySpark = false;
  };
  const brushTip = new Vector3();
  const brushHead = new Vector3();
  const chestFront = new Vector3();
  const twinkleColor = new Color();
  const waveCenter = new Vector3();
  const updateRewardVisuals = (dt) => {
    const state = playerState();
    const elapsed = ctx.time.elapsed;
    const itemHold = state.itemHold;
    const heldItem = itemHold ? itemHold.item : null;
    if (heldItem !== rewardState.lastHold) {
      rewardState.lastHold = heldItem;
      rewardState.revealAt = -1;
    }
    if (itemHold && itemHold.item === 'chromaBrush' && itemHold.t >= ITEM_HOLD.reveal && rewardState.revealAt < 0)
      rewardState.revealAt = elapsed;
    const chromaShown =
      !!chromaBrush &&
      state.brush === 'chroma' &&
      !(itemHold && itemHold.item === 'chromaBrush' && itemHold.t < ITEM_HOLD.reveal);
    if ((chromaShown !== bodyOnly || bodyOnlyGeo !== hero.mesh.geometry) && hero.bodyIndexCount > 0) {
      bodyOnly = chromaShown;
      bodyOnlyGeo = hero.mesh.geometry;
      hero.mesh.geometry.setDrawRange(0, chromaShown ? hero.bodyIndexCount : Infinity);
    }
    const brushMatrix = hero.bones[BONE.brush].matrixWorld;
    brushTip.copy(BRUSH_DIMS.tip).applyMatrix4(brushMatrix);
    brushHead.set(0, BRUSH_DIMS.tip.y - 0.2, 0.03).applyMatrix4(brushMatrix);
    if (chromaBrush) {
      const sinceReveal = rewardState.revealAt >= 0 ? elapsed - rewardState.revealAt : 9;
      const revealFlash = sinceReveal < 0.45 ? (1 - sinceReveal / 0.45) ** 2 : 0;
      const holdGlow = itemHold && itemHold.item === 'chromaBrush' ? 0.6 + 0.2 * Math.sin(elapsed * 5) : 0;
      chromaBrush.update(
        brushMatrix,
        chromaShown,
        0.18 + anim.cmb.glow * 1.1 + holdGlow,
        revealFlash,
        hero.mats.outlineWidth.value,
      );
    }
    if (dt <= 0) {
      chromaWave?.update(0);
      return;
    }
    if (fx && chromaShown && anim.brushInHand > 0.5)
      for (rewardState.twinkleT -= dt * (state.attack ? 30 : 7); rewardState.twinkleT <= 0;) {
        rewardState.twinkleT += 1;
        const random = Math.random;
        twinkleColor.setHex(PALETTE[COLORS[Math.floor(random() * 4)]].hex);
        fx.vfx.emit({
          type: random() < 0.5 ? VfxType.Star : VfxType.Drop,
          x: brushHead.x + (random() - 0.5) * 0.2,
          y: brushHead.y + (random() - 0.5) * 0.2,
          z: brushHead.z + (random() - 0.5) * 0.2,
          vx: (random() - 0.5) * 0.6,
          vy: 0.2 + random() * 0.6,
          vz: (random() - 0.5) * 0.6,
          size: 0.025 + random() * 0.035,
          life: 0.35 + random() * 0.35,
          color: twinkleColor,
          alpha: 1,
          drag: 2,
        });
      }
    if (state.charge > 0) rewardState.lastCharge = state.charge;
    const attack = state.attack;
    if (
      chromaWave &&
      attack &&
      attack.move === 'spin' &&
      state.brush === 'chroma' &&
      rewardState.seenSpin !== state.lastAttackTime
    ) {
      rewardState.seenSpin = state.lastAttackTime;
      const charge = Math.max(0.25, rewardState.lastCharge);
      waveCenter.set(state.position.x, anim.rootPos.y, state.position.z);
      chromaWave.start(waveCenter, CHROMA_BRUSH.waveRadius * (0.62 + 0.38 * charge), CHROMA_BRUSH.waveTime);
      if (fx) {
        fx.vfx.emit({
          type: VfxType.Star,
          x: waveCenter.x,
          y: waveCenter.y + 0.9,
          z: waveCenter.z,
          size: 1.8,
          grow: 1.6,
          life: 0.2,
          color: 0xffffff,
          alpha: 1,
        });
        for (let i = 0; i < 4; i++)
          fx.vfx.emit({
            type: VfxType.Ring,
            x: waveCenter.x,
            y: waveCenter.y + 0.06,
            z: waveCenter.z,
            size: 0.4,
            grow: 6 + i * 3,
            life: 0.4 + i * 0.08,
            color: PALETTE[COLORS[i]].hex,
            alpha: 0.9,
          });
      }
    }
    if (chromaWave && (chromaWave.update(dt), fx && chromaWave.active)) {
      const front = chromaWave.front;
      for (rewardState.waveSparkT -= dt * 90; rewardState.waveSparkT <= 0;) {
        rewardState.waveSparkT += 1;
        const angle = Math.random() * Math.PI * 2;
        const quadrant = ((Math.floor((angle + Math.PI) / (Math.PI / 2)) % 4) + 4) % 4;
        const x = waveCenter.x + Math.sin(angle) * front;
        const z = waveCenter.z + Math.cos(angle) * front;
        let y = waveCenter.y;
        try {
          y = Math.min(Math.max(ctx.terrain.heightAt(x, z), waveCenter.y - 0.6), waveCenter.y + 2.5);
        } catch {}
        fx.vfx.emit({
          type: Math.random() < 0.4 ? VfxType.Star : VfxType.Drop,
          x,
          y: y + 0.15,
          z,
          vx: Math.sin(angle) * 1.2,
          vy: 1.8 + Math.random() * 2.6,
          vz: Math.cos(angle) * 1.2,
          size: 0.04 + Math.random() * 0.05,
          life: 0.55 + Math.random() * 0.4,
          color: PALETTE[COLORS[quadrant]].hex,
          alpha: 1,
          drag: 1.4,
          gravity: -3,
        });
      }
    }
    if (fx)
      for (const shot of chromaShots) {
        if (!shot.alive) continue;
        for (let i = 0; i < 3; i++) {
          const subDt = dt / 3;
          shot.v.y += GRAVITY_Y * subDt;
          shot.p.addScaledVector(shot.v, subDt);
          shot.t += subDt;
          shot.k = (shot.k + 1) % 4;
          const speed = Math.hypot(shot.v.x, shot.v.y, shot.v.z) || 1;
          const halfW = 0.09;
          const px = (-shot.v.z / speed) * halfW;
          const pz = (shot.v.x / speed) * halfW;
          for (let j = 0; j < 2; j++) {
            const colorIdx = (shot.k + j * 2) % 4;
            const side = j === 0 ? 1 : -1;
            fx.vfx.emit({
              type: VfxType.Drop,
              x: shot.p.x + px * side,
              y: shot.p.y + (Math.random() - 0.5) * 0.05,
              z: shot.p.z + pz * side,
              vx: -shot.v.x * 0.05,
              vy: 0.2,
              vz: -shot.v.z * 0.05,
              size: 0.085 + Math.random() * 0.04,
              grow: 0.25,
              life: 0.5,
              color: PALETTE[COLORS[colorIdx]].hex,
              alpha: 1,
              drag: 3,
            });
          }
          if (i === 0)
            fx.vfx.emit({
              type: VfxType.Star,
              x: shot.p.x,
              y: shot.p.y,
              z: shot.p.z,
              vx: (Math.random() - 0.5) * 0.6,
              vy: 0.4,
              vz: (Math.random() - 0.5) * 0.6,
              size: 0.14 + Math.random() * 0.08,
              grow: 0.4,
              life: 0.32,
              color: 0xfff6e0,
              alpha: 1,
              drag: 2,
            });
        }
        let groundY = -1000000000;
        try {
          groundY = ctx.terrain.heightAt(shot.p.x, shot.p.z);
        } catch {}
        if (shot.t > 3 || shot.p.y < groundY - 0.2 || shot.p.y < (ctx.water?.level ?? 0) - 0.3) shot.alive = false;
      }
    if (itemFx) {
      chestFront.set(0, 0.1, 0.14).applyMatrix4(hero.bones[BONE.chest].matrixWorld);
      itemFx.update(dt, state, anim.handWorld, brushTip, brushHead, chestFront, fx);
    }
  };
  const capeColliders = clothColliders(14);
  const desiredOutfit = () => {
    const state = playerState();
    if (state.outfit !== 'sky') return 'classic';
    const itemHold = state.itemHold;
    return itemHold && itemHold.item === 'skyMantle' && itemHold.t < SKY_MANTLE.on ? 'classic' : 'sky';
  };
  // a scarf from the wardrobe (orb/wardrobe.js): [base, dark, band], or null for the outfit's own
  let scarfLook = null;
  let skyOutfit = false;
  const applyScarf = () => {
    const [base, dark, band, tip] = scarfLook ?? outfitScarf(skyOutfit ? 'sky' : 'classic');
    scarf?.setColors(base, dark, band, tip);
    hero.mats.scarf.base.value.set(base);
    hero.mats.scarf.dark.value.set(dark);
  };
  const syncOutfit = (state) => {
    const outfit = desiredOutfit();
    if (!hero.setOutfit(outfit)) return;
    const sky = outfit === 'sky';
    skyOutfit = sky;
    applyScarf();
    if (cape && ((cape.mesh.visible = sky && !capeFailed), cape.reset(), sky && state.itemHold?.item === 'skyMantle')) {
      const facing = state.facing;
      cape.billow(-Math.sin(facing) * 3.5, 7.5, -Math.cos(facing) * 3.5);
    }
  };
  const character = {
    object: hero.group,
    setScarf(look) {
      scarfLook = look;
      applyScarf();
    },
    /** A hood from the wardrobe: [base, light, lining], or null for the classic. */
    setHood(colors) {
      const [base, light, lining] = colors ?? classicHood();
      hero.mats.hood.base.value.set(base);
      hero.mats.hood.light.value.set(light);
      hero.mats.hood.lining.value.set(lining);
    },
    /** A glider canopy from the wardrobe: a CANOPIES key, or null for the classic. */
    setGlider(canopy) {
      glider?.setDesign(CANOPIES[canopy] ?? null);
    },
    brushTipWorld(out) {
      return out.copy(BRUSH_DIMS.tip).applyMatrix4(hero.bones[BONE.brush].matrixWorld);
    },
    castPoint(out) {
      const state = playerState();
      if (state.mode === 'fly' || anim.weights.fly > 0.5) {
        const hand = anim.handWorld[0];
        out.set(hand.x + Math.sin(state.facing) * 0.12, hand.y + 0.03, hand.z + Math.cos(state.facing) * 0.12);
        if (Number.isFinite(out.x + out.y + out.z)) return out;
      }
      return out.copy(BRUSH_DIMS.tip).applyMatrix4(hero.bones[BONE.brush].matrixWorld);
    },
    headWorld(out) {
      return out.set(0, 0.115, 0.01).applyMatrix4(hero.bones[BONE.head].matrixWorld);
    },
    update(dt) {
      if (puppet)
        try {
          puppet.update(dt);
        } catch (err) {
          console.error('[character] puppet', err);
        }
    },
    lateUpdate(dt) {
      const state = playerState();
      anim.update(dt);
      hero.group.position.copy(anim.rootPos);
      hero.group.rotation.set(0, anim.yaw.x, 0);
      hero.applyPose();
      hero.mats.tint.value.set(PALETTE[state.selectedColor]?.hex ?? 16777215);
      hero.group.updateMatrixWorld(true);
      {
        const camPos = ctx.camera.position;
        const rootPos = anim.rootPos;
        const focusY = Math.min(Math.max(camPos.y, rootPos.y + 0.25), rootPos.y + 1.55);
        const eyeDist = Math.hypot(camPos.x - rootPos.x, camPos.y - focusY, camPos.z - rootPos.z) - 0.18;
        const fade = Math.min(1, Math.max(0, (eyeDist - 0.35) / 0.65));
        heroFade.value = fade * fade * (3 - 2 * fade);
      }
      const camDist = ctx.camera.position.distanceTo(hero.group.position);
      hero.mats.outlineWidth.value = MathUtils.clamp(camDist * 0.0023, 0.0035, 0.03);
      const sinceFlick = state.lastFlickTime >= 0 ? ctx.time.elapsed - state.lastFlickTime : 9;
      const cmb = anim.cmb;
      hero.mats.tintGlow.value = Math.max(
        sinceFlick < 0.4 ? 0.5 * (1 - sinceFlick / 0.4) : 0,
        cmb.glow * 1.6,
        anim.art.glow * 1.5,
      );
      hero.mats.flashColor.value.copy(cmb.flashColor);
      hero.mats.flashAmt.value = cmb.flash;
      if (glider) glider.update(dt, anim.gliderOpen, anim.gliderBank, anim.gliderPitch, state.speed);
      try {
        syncOutfit(state);
      } catch (err) {
        if (!outfitWarned) console.warn('[character] outfit', err);
        outfitWarned = true;
      }
      const capeOn = !!cape && cape.mesh.visible;
      if (scarf) scarf.mesh.visible = !capeOn;
      if (scarf && dt > 0 && !capeOn) {
        fitScarf(hero.bones, scarf, scarfColliders);
        scarf.groundY =
          state.mode === 'fly'
            ? floorAt(state.position.x, state.position.z, anim.rootPos.y - 40, state.position.y)
            : anim.rootPos.y + (state.mode === 'swim' ? 1.25 : 0);
        scarf.update(dt);
      }
      if (cape && capeOn && dt > 0 && !capeFailed)
        try {
          fitCape(hero.bones, cape, capeColliders);
          cape.groundY =
            state.mode === 'fly'
              ? floorAt(state.position.x, state.position.z, anim.rootPos.y - 40, state.position.y)
              : anim.rootPos.y + (state.mode === 'swim' ? 1.25 : 0);
          const mantleT = itemFx ? itemFx.mantleOnT : -1;
          cape.mat.glow.value = mantleT >= 0 && mantleT < 1.4 ? 1.1 * (1 - mantleT / 1.4) ** 2 : 0;
          cape.update(dt);
        } catch (err) {
          console.warn('[character] cape', err);
          capeFailed = true;
          cape.mesh.visible = false;
        }
      if (vines)
        try {
          vines.update(dt, state, ctx.time.elapsed, fx, anim.ankleWorld);
        } catch (err) {
          if (!vinesWarned) console.warn('[character] vines', err);
          vinesWarned = true;
        }
      const floorY =
        state.mode === 'fly' || anim.weights.fly > 0.05
          ? floorAt(state.position.x, state.position.z, anim.rootPos.y - 40, state.position.y)
          : anim.rootPos.y;
      if (fx) {
        character.brushTipWorld(tipWorld);
        fx.update(dt, state, tipWorld, anim.handWorld, anim.ankleWorld, anim.brushInHand, floorY);
      }
      if (flightFx && !flightFxFailed)
        try {
          flightFx.update(dt, state, hero.bones[BONE.brush].matrixWorld, anim.fly.brushW, fx, floorY);
        } catch (err) {
          console.warn('[character] flight fx', err);
          flightFxFailed = true;
        }
      try {
        updateCombatVisuals(dt);
      } catch (err) {
        if (!combatVisualsWarned) console.warn('[character] combat visuals', err);
        combatVisualsWarned = true;
      }
      try {
        updateRewardVisuals(dt);
      } catch (err) {
        if (!rewardVisualsWarned) console.warn('[character] reward visuals', err);
        rewardVisualsWarned = true;
      }
      if (gear && !gearFailed)
        try {
          const prizes = itemFx?.prizes;
          gear.lightOverrideK = prizes ? prizes.lightK : 0;
          if (prizes && prizes.lightK > 0) gear.lightOverride.copy(prizes.prizeWorld);
          gear.update(dt, state, hasItem, fx);
        } catch (err) {
          console.warn('[character] gear', err);
          gearFailed = true;
        }
      if (followCam) {
        const view = ctx.params.get('view') ?? '34';
        const yawOffset =
          state.mode === 'climb' && !ctx.params.has('climbview')
            ? Math.PI + 0.5
            : view === 'front'
              ? 0
              : view === 'back'
                ? Math.PI
                : view === 'side'
                  ? Math.PI / 2
                  : view === 'portrait'
                    ? 0.45
                    : view === 'wide'
                      ? 0.9
                      : 0.75;
        const blend = 1 - Math.exp(-3 * Math.max(dt, 0.001));
        glideK += (+(state.mode === 'glide') - glideK) * blend;
        swimK += (+(state.mode === 'swim') - swimK) * blend;
        const glide = glideK;
        const dist = Number(
          ctx.params.get('dist') ?? (view === 'portrait' ? 1.5 : view === 'wide' ? 7 : 4.2 + glide * 2),
        );
        const swim = swimK;
        const lookH = Number(ctx.params.get('lookh') ?? (view === 'portrait' ? 1.42 : 0.9 + glide * 0.9 + swim * 0.35));
        const camH = Number(ctx.params.get('camh') ?? (view === 'portrait' ? 1.55 : 1.5 + glide * 0.6 + swim * 1.4));
        if (state.mode !== 'glide') state.mode;
        const yaw = anim.yaw.x;
        if (!followInit) followYaw.snap(yaw + yawOffset);
        const smoothYaw = followYaw.step(yaw + yawOffset, followInit ? dt : 0);
        const rootPos = anim.rootPos;
        if (followLook.distanceToSquared(rootPos) > 36) followInit = false;
        followLook.set(rootPos.x, rootPos.y + lookH, rootPos.z);
        const cx = rootPos.x + Math.sin(smoothYaw) * dist;
        const cz = rootPos.z + Math.cos(smoothYaw) * dist;
        const cy = rootPos.y + camH;
        if (!followInit) {
          followPos.set(cx, cy, cz);
          followInit = true;
        } else {
          const ease = 1 - Math.exp(-6 * Math.max(dt, 0.001));
          followPos.x += (cx - followPos.x) * ease;
          followPos.y += (cy - followPos.y) * ease;
          followPos.z += (cz - followPos.z) * ease;
        }
        ctx.camera.position.copy(followPos);
        ctx.camera.lookAt(followLook);
        const fov = Number(ctx.params.get('fov'));
        if (fov > 0 && ctx.camera instanceof PerspectiveCamera && ctx.camera.fov !== fov) {
          ctx.camera.fov = fov;
          ctx.camera.updateProjectionMatrix();
        }
      }
    },
  };
  return character;
}
let combatVisualsWarned = false;
let gearFailed = false;
let rewardVisualsWarned = false;
let outfitWarned = false;
let capeFailed = false;
let vinesWarned = false;
const _footstepPos = new Vector3();
const _footFxPos = new Vector3();
