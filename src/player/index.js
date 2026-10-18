/**
 * Player system entry: builds the controller, camera rig, painter, combat, items and brush arts, applies URL debug options and returns the player API that runs every frame.
 */
import { MathUtils } from 'three';
import { COLORS, ITEMS } from '../core/config.js';
import { BrushArts } from './brush-arts.js';
import { CameraRig } from './camera-rig.js';
import { Combat } from './combat.js';
import { makeIntent, PlayerController } from './controller.js';
import { Inventory } from './items.js';
import { Painter } from './painter.js';
import { TrainingDummies } from './training-dummies.js';
import { TUNING } from './tuning.js';
export async function create(ctx) {
  const ctrl = new PlayerController(ctx);
  const rig = new CameraRig(ctx, ctrl);
  const painter = new Painter(ctx, ctrl, rig);
  const combat = new Combat(ctx, ctrl, rig);
  const items = new Inventory(ctx, ctrl, rig, combat);
  let arts = null;
  try {
    arts = new BrushArts(ctx, ctrl, rig);
    painter.arts = arts;
  } catch (err) {
    console.warn('[player] brush arts disabled', err);
  }
  window.__wbCombat = {
    combat,
    ctrl,
    rig,
    items,
    arts,
    painter,
  };
  const input = ctx.input;
  const params = ctx.params;
  let dummy = null;
  if (params.has('dummy') && ctx.enemies?.isStub)
    try {
      dummy = new TrainingDummies(ctx, ctrl.state.position, ctrl.state.facing, params.get('dummy') || '1');
      ctx.enemies = dummy;
    } catch (err) {
      console.warn('[player] training dummy failed', err);
    }
  const hp = Number(params.get('hp'));
  if (params.has('hp') && Number.isFinite(hp) && hp > 0) ctrl.state.health = Math.min(ctrl.state.healthMax, hp);
  if (params.get('brush') === 'chroma') {
    ctrl.state.brush = 'chroma';
    items.owned.add('chromaBrush');
  }
  const startFlying = params.has('fly') && params.get('fly') !== '0';
  let flyFrames = +!!startFlying;
  if (startFlying) items.owned.add('brushflight');
  if (params.get('perch') === 'claimed') items.owned.add('brushflight');
  const giveItems = params
    .getAll('giveitem')
    .flatMap((item) => item.split(','))
    .map((item) => item.trim())
    .filter((item) => !!item && item in ITEMS);
  if (startFlying) for (const giveItem of giveItems) items.grantSilently(giveItem);
  else if (giveItems.length)
    ctx.events.once('game:start', () => setTimeout(() => giveItems.forEach((giveItem) => items.give(giveItem)), 1000));
  if (params.get('outfit') === 'sky') items.grantSilently('skyMantle');
  for (const item of (params.get('items') ?? '').split(',').map((item) => item.trim()))
    if (item && item in ITEMS) items.grantSilently(item);
  const stamina = Number(params.get('stamina'));
  if (params.has('stamina') && Number.isFinite(stamina) && stamina >= 1) {
    ctrl.state.staminaMax = Math.min(3, Math.round(stamina * 10) / 10);
    ctrl.state.stamina = ctrl.state.staminaMax;
  }
  const slow = Number(params.get('slow'));
  if (params.has('slow') && Number.isFinite(slow) && slow > 0)
    ctx.events.once('game:start', () =>
      setTimeout(() => {
        ctrl.state.slowedUntil = ctx.time.elapsed + slow;
      }, 600),
    );
  ctrl.climbAnywhere = params.has('climbanywhere') && params.get('climbanywhere') !== '0';
  const debugpaint = params.get('debugpaint');
  if (debugpaint && COLORS.includes(debugpaint)) ctrl.debugPaint = debugpaint;
  ctrl.logEnabled = params.has('plog');
  const pitch = Number(params.get('pitch'));
  if (params.has('pitch') && Number.isFinite(pitch)) rig.pitch = (pitch * Math.PI) / 180;
  const zoom = Number(params.get('zoom'));
  if (params.has('zoom') && Number.isFinite(zoom))
    rig.zoom = MathUtils.clamp(zoom, TUNING.camMinDist, TUNING.camMaxDist);
  const intent = makeIntent();
  let controlAllowed = true;
  const holds = new Set();
  let hasControl = true;
  const refreshControl = () => {
    const on = controlAllowed && holds.size === 0;
    if (on !== hasControl)
      ctrl.log(`control ${on ? 'on' : 'off'}${holds.size ? ` (holds: ${[...holds].join(',')})` : ''}`);
    hasControl = on;
    ctrl.setControlDisabled(!on);
  };
  const setHold = (key, on) => {
    if (on !== holds.has(key)) {
      if (on) holds.add(key);
      else holds.delete(key);
      refreshControl();
    }
  };
  let cinematicShot = null;
  let itemShot = null;
  const applyShot = () => {
    try {
      rig.setShot(itemShot ?? cinematicShot);
    } catch (err) {
      console.warn('[player] cinematic failed', err);
    }
  };
  items.onShot = (shot) => {
    itemShot = shot;
    applyShot();
  };
  items.onHold = (on) => setHold('item', on);
  const readIntent = () => {
    const live = hasControl && !ctrl.state.dead;
    if (live) intent.move.copy(input.move);
    else intent.move.set(0, 0);
    intent.jumpPressed = live && input.pressed('jump');
    intent.jumpHeld = live && input.held('jump');
    intent.sprintHeld = live && input.held('sprint');
    intent.dropPressed = live && input.pressed('drop');
    const busy = combat.busy;
    intent.aimHeld = live && input.held('aim') && !busy;
    intent.ridePressed = live && input.pressed('ride');
    const flying = ctrl.currentMode === 'fly';
    intent.sinkHeld = live && flying && input.held('drop');
    intent.streamHeld =
      live && flying && !intent.aimHeld && (input.held('paint') || (input.held('attack') && !input.held('drop')));
    const canPaint = live && !busy && (intent.aimHeld || (!input.held('attack') && !flying));
    intent.paintHeld = canPaint && input.held('paint');
    intent.paintPressed = canPaint && input.pressed('paint');
  };
  if (ctx.debug)
    try {
      const folder = ctx.debug.addFolder('Player');
      for (const key of [
        'runSpeed',
        'sprintSpeed',
        'accel',
        'decel',
        'gravity',
        'jumpHeight',
        'coyote',
        'jumpBuffer',
        'glideSpeed',
        'glideSink',
        'climbSpeed',
        'slideGravity',
        'slideMax',
        'slideCarve',
        'camDist',
        'camFollowH',
        'camFollowV',
        'camLookAhead',
        'lookSens',
      ])
        folder.add(TUNING, key);
      folder.add(ctrl, 'climbAnywhere');
      const flyFolder = folder.addFolder('Brushflight');
      for (const key of 'flyCruise.flyBoost.flyAccel.flyBoostAccel.flyCoast.flyBrake.flyEase.flyStrafe.flyRise.flySink.flyTurnSlow.flyTurnFast.flyTurnIdle.flyPitchBias.flyPitchGain.flyDiveGain.flyBankTurn.flyBoostDrain.flyCeiling.flyCrashSpeed.flyLandSpeed.flyStreamStep.flyCamDist.flyCamSpeedDist.flyFovBoost.flyCamRoll'.split(
        '.',
      ))
        flyFolder.add(TUNING, key);
      flyFolder
        .add(
          {
            ride: () =>
              ctrl.currentMode === 'fly' ? ctrl.dismountFly('air') : (items.owned.add('brushflight'), ctrl.mountFly()),
          },
          'ride',
        )
        .name('mount / dismount');
      flyFolder.close();
      const paintOpts = {
        paint: ctrl.debugPaint ?? 'none',
      };
      folder
        .add(paintOpts, 'paint', ['none', ...COLORS])
        .name('debug paint')
        .onChange((value) => {
          ctrl.debugPaint = value === 'none' ? null : value;
        });
      folder.add(ctrl.state, 'stamina', 0, 1).listen();
      folder.add(ctrl.state, 'mode').listen();
      folder.close();
    } catch {}
  rig.snap(ctrl.state.facing);
  painter.updateAim();
  combat.onTeleport = (pos, facing) => {
    ctrl.teleport(pos, facing);
    ctrl.lateUpdate();
    ctrl.state.position.copy(pos);
    rig.snap(facing);
  };
  const api = {
    state: ctrl.state,
    teleport(pos, facing) {
      if (pos && Number.isFinite(pos.x + pos.y + pos.z)) {
        ctrl.log(`teleport ${pos.x.toFixed(1)},${pos.y.toFixed(1)},${pos.z.toFixed(1)}`);
        ctrl.teleport(pos, facing);
        ctrl.lateUpdate();
        ctrl.state.position.copy(pos);
        rig.snap(facing);
      }
    },
    get cameraYaw() {
      return rig.yaw;
    },
    damage(hit) {
      return combat.damage(hit);
    },
    giveItem(id) {
      try {
        items.give(id);
      } catch (err) {
        console.warn('[player] giveItem failed', err);
      }
    },
    hasItem(id) {
      return items.has(id);
    },
    setCinematic(cinematic) {
      cinematicShot = cinematic && cinematic.position && cinematic.target ? cinematic : null;
      applyShot();
    },
    setInputHold(key, on) {
      setHold(`ext:${String(key)}`, !!on);
    },
    heal(amount) {
      combat.heal(amount);
    },
    setControlEnabled(enabled) {
      if (controlAllowed !== !!enabled) ctrl.log(`control ${enabled ? 'enabled' : 'disabled'}`);
      controlAllowed = !!enabled;
      refreshControl();
    },
    update(dt) {
      readIntent();
      ctrl.cameraYaw = rig.yaw;
      ctrl.cameraPitch = rig.pitch;
      let indoors = false;
      try {
        indoors = !!ctx.interiors?.current;
      } catch {
        indoors = false;
      }
      ctrl.rideUnlocked = items.has('brushflight') && !items.active && !ctrl.state.dead && !indoors;
      if (indoors && ctrl.currentMode === 'fly') ctrl.dismountFly('air', 0);
      if (arts) {
        arts.emberCrest = items.has('emberCrest');
        arts.frostCrest = items.has('frostCrest');
      }
      if (flyFrames > 0 && dt > 0) {
        flyFrames++;
        if (flyFrames === 4) {
          const pos = ctrl.state.position.clone();
          pos.y += 20;
          api.teleport(pos, ctrl.state.facing);
        } else if (flyFrames >= 6) {
          flyFrames = 0;
          ctrl.mountFly();
          rig.levelOut(TUNING.flyPitchBias);
        }
      }
      painter.preUpdate(dt, intent, input, hasControl && !ctrl.state.dead);
      combat.preUpdate(dt, intent, hasControl, painter.isWheelOpen || intent.aimHeld);
      arts?.preUpdate(dt);
      try {
        items.update(dt);
      } catch (err) {
        console.warn('[player] item moment', err);
      }
      ctrl.update(dt, intent);
      painter.update(dt, intent);
      arts?.update(dt);
      combat.update(dt);
      if (dummy)
        try {
          dummy.update(dt);
        } catch (err) {
          console.warn('[player] dummy update', err);
        }
    },
    lateUpdate() {
      ctrl.lateUpdate();
      items.lateUpdate();
      const canLook = hasControl && !painter.isWheelOpen && !ctrl.state.dead;
      rig.update(
        Math.max(ctx.time.realDt, 0.0001),
        canLook ? input.lookDelta.x : 0,
        canLook ? input.lookDelta.y : 0,
        canLook ? input.wheel : 0,
      );
      painter.updateAim();
    },
    dispose() {
      try {
        ctx.colliders.unregister(ctrl.collider);
        ctx.physics.removeRigidBody(ctrl.body);
      } catch {}
    },
  };
  return api;
}
