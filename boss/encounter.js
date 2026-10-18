/**
 * The Greymaw encounter: wakes the boss when the hero reaches the arena floor, directs the rising intro, the fight and the reset after a death, the death and victory cinematics, the closing ink edge, and the grand chest that gives the Chroma Brush.
 */
import { Color, Vector3 } from 'three';
import { COLORS } from '../core/config.js';
import { POOL_RADIUS } from './arena.js';
import { BossChest } from './chest.js';
import { paintColor } from './fx.js';
import { CH } from './greymaw-pose.js';
import { PHASE_NAMES } from './greymaw-tuning.js';
import { clamp, easeInOut, easeOut, rand, smoothstep, TAU } from './math.js';
const DORMANT_RISE = 0.36;
const _scratch = new Vector3();
const _scratch2 = new Vector3();
const _tint2 = new Color();
const BURST_WHITE = new Color(1, 1, 1);
const VICTORY_GOLD = new Color(1, 0.82, 0.45);
export class BossEncounter {
  ctx;
  arena;
  boss;
  fx;
  opts;
  mode = 'dormant';
  t = 0;
  realT = 0;
  defeated = false;
  started = false;
  startPhase = 1;
  shot = {
    position: new Vector3(),
    target: new Vector3(),
    fov: 50,
    blend: 0.9,
  };
  shotOn = false;
  dp = new Vector3(0, 0, 1);
  sv = new Vector3(1, 0, 0);
  anchor = new Vector3();
  chest;
  promptOn = false;
  itemGiven = false;
  itemWait = 0;
  victory = 0;
  clear = 0;
  drain = 0;
  edge = 0;
  edgeFade = 0;
  dyingDone = new Set();
  resetDelay = 0;
  firstFrame = true;
  offs = [];
  brazierT = 0;
  dormantFx = 0;
  nearT = 0;
  constructor(ctx, arena, boss, fx, opts) {
    this.ctx = ctx;
    this.arena = arena;
    this.boss = boss;
    this.fx = fx;
    this.opts = opts;
    const center = arena.center;
    this.chest = new BossChest(ctx, center.clone(), arena.stairYaw);
    boss.onDefeat = () => this.beginDeath();
    boss.onPhase = (phase) => {
      this.emit('boss:phase', {
        phase,
        name: PHASE_NAMES[phase] ?? '',
      });
      try {
        if (phase === 2)
          this.ctx.ui.toast(
            'The Stolen Colours',
            'Its crystals guard it — break them with their opposite colour: Ember ↔ Frost · Spring ↔ Bloom',
          );
        if (phase === 3) this.ctx.ui.toast('Desperation', 'The ink is swallowing the arena — finish it!');
      } catch {}
    };
    this.offs.push(
      ctx.events.on('player:death', () => {
        if (this.mode === 'intro' || this.mode === 'fight') {
          this.mode = 'resetting';
          this.resetDelay = 1.4;
          this.t = 0;
        }
      }),
    );
    this.offs.push(ctx.events.on('paint:splat', (splat) => this.boss.onSplat(splat)));
  }
  dispose() {
    for (const off of this.offs) off();
  }
  get fightActive() {
    return this.started && (this.mode === 'fight' || this.mode === 'intro');
  }
  update(dt) {
    const realDt = (this.ctx.time?.scale ?? 1) <= 0 ? 0 : Math.max(0, this.ctx.time?.realDt ?? dt);
    if (this.firstFrame) {
      this.firstFrame = false;
      this.applyDebugStart();
      this.graceT = 1.5;
    }
    this.graceT = Math.max(0, this.graceT - realDt);
    this.t += dt;
    this.realT += realDt;
    const state = this.ctx.player?.state;
    const playerPos = state?.position ?? this.arena.center;
    const center = this.arena.center;
    const dist = Math.hypot(playerPos.x - center.x, playerPos.z - center.z);
    const near = dist < 170;
    if (!this.defeated && near && (this.mode !== 'dormant' || dist < 110)) this.boss.update(dt);
    switch (this.mode) {
      case 'dormant':
        this.stepDormant(dt, dist, playerPos);
        break;
      case 'intro':
        this.stepIntro(dt, realDt);
        break;
      case 'fight':
        this.stepFight(dt, dist, playerPos);
        break;
      case 'dying':
        this.stepDying(dt, realDt);
        break;
      case 'victory':
        this.stepVictory(dt, realDt);
        break;
      case 'chest':
        this.stepChest(dt, playerPos);
        break;
      case 'opening':
        this.stepOpening(dt, realDt);
        break;
      case 'resetting':
        this.stepReset(dt);
    }
    const present = !this.defeated;
    if (present) this.arena.setBodyTop(this.arena.floorY + 10.5 * this.boss.pose.rise - 1.5);
    this.arena.setVictory(this.victory);
    this.arena.setClear(this.clear);
    const agitation = this.mode === 'intro' ? 1 : this.mode === 'fight' ? 0.45 : this.mode === 'resetting' ? 0.8 : 0.12;
    this.arena.setPool(agitation, this.drain, center, this.boss.state === 'stagger' ? 4 : 3.3);
    const hazards = this.boss.hazards;
    if (hazards.edgeOn && this.mode === 'fight') {
      this.edge = Math.max(16.5, (this.edge || 23.5) - dt * 0.3);
      this.edgeFade = Math.min(1, this.edgeFade + dt * 0.5);
      hazards.edgeFront = this.edge;
    } else {
      this.edgeFade = Math.max(0, this.edgeFade - dt * 0.4);
      if (this.edgeFade <= 0) this.edge = 0;
    }
    this.arena.setEdge(this.edge || 24, this.edgeFade);
    if (this.edgeFade > 0.05 && this.edge > 0 && dist < 60 && dt > 0) {
      const angle = Math.random() * TAU;
      const radius = this.edge + rand(-0.3, 1.5);
      _scratch.set(center.x + Math.cos(angle) * radius, center.y + 0.1, center.z + Math.sin(angle) * radius);
      this.fx.inkSplash(_scratch, _scratch2.set(0, 1, 0), 2, 2.2, 0.08);
      if (Math.random() < 0.08) {
        this.fx.dust(_scratch, 3, 0.8, 0.6);
        this.fx.shards.spawn(
          this.fx.now,
          _scratch.x,
          _scratch.y + 0.2,
          _scratch.z,
          rand(-1, 1),
          rand(2, 4),
          rand(-1, 1),
          rand(0.15, 0.3),
          1.4,
          center.y - 0.2,
          _tint2.set(9406332),
          1,
          5,
        );
      }
    }
    this.arena.update(realDt, near && dist < 150);
    this.boss.setVisible(present && dist < 190 && this.boss.state !== 'gone');
    this.chest.setOpen(
      this.chest.lidAngle,
      this.mode === 'opened' ? 0.35 + 0.1 * Math.sin(this.realT * 2) : this.chestRays,
      this.mode === 'chest' ? 0.9 : 0.35,
    );
    if (this.defeated && dist < 60 && ((this.brazierT += dt), this.brazierT > 0.05)) {
      this.brazierT = 0;
      for (const brazier of this.arena.braziers) {
        paintColor(brazier.color, _tint2);
        this.fx.glows.spawn(
          this.fx.now,
          brazier.pos.x + rand(-0.3, 0.3),
          brazier.pos.y,
          brazier.pos.z + rand(-0.3, 0.3),
          rand(-0.3, 0.3),
          rand(1.5, 3),
          rand(-0.3, 0.3),
          rand(0.25, 0.45),
          rand(0.5, 0.9),
          _tint2,
          3,
          -1,
          1.2,
          0.8,
        );
      }
    }
    if (this.arena.barrierUp && state && dist > 22.2 && dist < 23.6) this.arena.bump(playerPos);
  }
  chestRays = 0;
  graceT = 0;
  lateUpdate(dt) {
    const position = this.ctx.player?.state?.position;
    if (
      !(
        position &&
        Math.hypot(position.x - this.arena.center.x, position.z - this.arena.center.z) > 190 &&
        (this.mode === 'dormant' || this.defeated)
      ) &&
      (!this.defeated || this.boss.state !== 'gone')
    )
      this.boss.lateUpdate(dt);
    this.fx.setTime(this.ctx.time.elapsed);
    this.fx.flush();
  }
  prewarm() {
    this.prewarmed = true;
    const roots = [this.fx.group, this.arena.barrier, this.arena.edge, this.chest.group, this.chest.beamMesh];
    const saved = [];
    for (const root of roots)
      root.traverse((obj) => {
        saved.push([obj, obj.visible]);
        obj.visible = true;
      });
    try {
      for (const root of roots) this.ctx.renderer.compile(root, this.ctx.camera, this.ctx.scene);
    } catch (err) {
      console.warn('[boss] prewarm failed', err);
    }
    for (const [obj, visible] of saved) obj.visible = visible;
  }
  prewarmed = false;
  stepDormant(dt, dist, playerPos) {
    const boss = this.boss;
    if (!this.prewarmed && dist < 95) this.prewarm();
    boss.pose.rise += (DORMANT_RISE - boss.pose.rise) * Math.min(1, dt * 1.5);
    if (dist < 80 && ((this.dormantFx += dt), this.dormantFx > 0.25)) {
      this.dormantFx = 0;
      const center = this.arena.center;
      const angle = Math.random() * TAU;
      const radius = rand(3.6, POOL_RADIUS - 0.3);
      this.fx.inkSplash(
        _scratch.set(center.x + Math.cos(angle) * radius, center.y + 0.05, center.z + Math.sin(angle) * radius),
        _scratch2.set(0, 1, 0),
        3,
        1.6,
        0.07,
      );
    }
    const state = this.ctx.player?.state;
    if (!state || state.dead || this.defeated) return;
    let started = true;
    try {
      started = this.ctx.ui?.started !== false;
    } catch {
      started = true;
    }
    const onFloor = Math.abs(playerPos.y - this.arena.floorY) < 3.5;
    if (dist < 20.4 && onFloor && started) {
      this.nearT += dt;
      if (this.nearT > 0.15) this.beginIntro();
    } else this.nearT = 0;
  }
  beginIntro() {
    const boss = this.boss;
    const center = this.arena.center;
    const playerPos = this.ctx.player?.state?.position ?? center.clone().add(_scratch.set(0, 0, 12));
    this.dp.set(playerPos.x - center.x, 0, playerPos.z - center.z);
    if (this.dp.lengthSq() < 1) this.dp.copy(this.arena.stairDir);
    this.dp.normalize();
    this.sv.set(this.dp.z, 0, -this.dp.x);
    this.anchor.copy(playerPos);
    this.mode = 'intro';
    this.t = 0;
    this.realT = 0;
    this.dyingDone.clear();
    boss.resetStats();
    boss.setState('rising');
    boss.pose.yaw = Math.atan2(this.dp.x, this.dp.z);
    this.setControl(false);
    this.play('boss-rise', center, 1);
    this.shot.position
      .copy(playerPos)
      .addScaledVector(this.dp, 4.5)
      .addScaledVector(this.sv, 1.6)
      .setY(playerPos.y + 2.4);
    this.shot.target.copy(center).setY(center.y + 2.5);
    this.shot.blend = 0.9;
    this.setShot(true);
  }
  stepIntro(dt, realDt) {
    const boss = this.boss;
    const pose = boss.pose;
    const center = this.arena.center;
    const t2 = this.t;
    const emerge = easeInOut(clamp((t2 - 0.35) / 2.6, 0, 1));
    pose.rise = DORMANT_RISE + 0.64 * emerge;
    const roar = smoothstep(3.05, 3.35, t2) * (1 - smoothstep(4.4, 4.9, t2));
    pose.set(CH.LEAN_P, 0.4 - 0.3 * emerge - 0.22 * roar);
    pose.set(CH.CHEST_P, 0.2 - 0.1 * emerge - 0.25 * roar);
    pose.set(CH.HEAD_P, 0.35 - 0.3 * emerge + 0.32 * roar);
    pose.set(CH.HEAD_Y, 0);
    pose.set(CH.EYE, t2 < 2.7 ? 0.15 : 1.35);
    pose.set(CH.GLOW, smoothstep(2.6, 3, t2) * (0.6 + 0.4 * roar));
    pose.set(CH.ANGER, smoothstep(2.7, 3.2, t2));
    pose.set(CH.JAW, 0.05 + roar * 0.9);
    pose.set(CH.MOUTH, roar * 1.2);
    const sunk = (1 - pose.rise) * 10.5;
    const climb = smoothstep(0.2, 0.9, t2);
    pose.fist(
      0,
      3.8 + 1.9 * climb + roar * 2.5,
      1.35 + roar * 7 + sunk * (1 - climb) * 0.7,
      3.2 + 1.6 * climb - roar * 2,
    );
    pose.fist(
      1,
      -3.8 - 1.9 * climb - roar * 2.5,
      1.35 + roar * 7 + sunk * (1 - climb) * 0.7,
      3.2 + 1.6 * climb - roar * 2,
    );
    if (climb < 1) {
      pose.fist(0, 5.7, 1.35 + sunk, 4.8);
      pose.fist(1, -5.7, 1.35 + sunk, 4.8);
      if (t2 < 0.2) {
        pose.fist(0, 3.8, 0.5 + sunk * 0.4, 3.2);
        pose.fist(1, -3.8, 0.5 + sunk * 0.4, 3.2);
      }
    }
    if (this.once('grip', t2, 0.9)) {
      for (const side of [0, 1]) {
        const fist = pose.worldFist[side];
        this.fx.inkSplash(_scratch.set(fist.x, center.y + 0.3, fist.z), null, 14, 5, 0.12);
        this.fx.dust(_scratch, 6, 1.4, 0.8);
      }
      this.emit('camera:shake', {
        strength: 0.45,
        position: center.clone(),
      });
      this.play('boss-slam', center, 0.5, 0.8);
    }
    pose.set(CH.MASK_R, Math.sin(t2 * 40) * 0.04 * roar);
    if (t2 > 0.4 && t2 < 3.2 && Math.random() < 0.9) {
      const surf = boss.model.rig.surface[Math.floor(Math.random() * boss.model.rig.surface.length)];
      pose.boneWorld(surf.bone, surf.pos, _scratch);
      this.fx.drops.spawn(
        this.fx.now,
        _scratch.x + rand(-1, 1),
        _scratch.y,
        _scratch.z + rand(-1, 1),
        rand(-1, 1),
        rand(-1, 0.5),
        rand(-1, 1),
        rand(0.12, 0.3),
        1.6,
        center.y,
        _tint2.set(2894387),
        0,
        18,
        0.3,
      );
    }
    if (t2 > 1 && t2 < 3.3)
      for (let i = 0; i < 3; i++) {
        const ci = Math.floor(Math.random() * 4);
        boss.pose.crystalWorld(ci, _scratch2);
        const angle = Math.random() * TAU;
        const dist = rand(10, 26);
        _scratch.set(center.x + Math.cos(angle) * dist, center.y + rand(0.5, 8), center.z + Math.sin(angle) * dist);
        this.fx.streams.spawn(
          this.fx.now,
          _scratch,
          _scratch2,
          rand(0.8, 1.3),
          paintColor(COLORS[ci], _tint2),
          2.4,
          rand(0.14, 0.26),
          rand(1, 4),
          rand(1, 3),
          rand(0.5, 1.5),
          2.2,
        );
      }
    const shot = this.shot;
    const anchor = this.anchor;
    if (t2 < 1.3) {
      shot.position
        .copy(anchor)
        .addScaledVector(this.dp, 4.5 + t2 * 0.4)
        .addScaledVector(this.sv, 1.6)
        .setY(anchor.y + 2.4 + t2 * 0.3);
      shot.target.copy(center).setY(center.y + 2.5 + t2);
    } else if (t2 < 3.1) {
      const u2 = easeInOut((t2 - 1.3) / 1.8);
      _scratch
        .copy(center)
        .addScaledVector(this.dp, 17 - 1.5 * u2)
        .addScaledVector(this.sv, 7 - 5 * u2)
        .setY(center.y + 1.2 + 1.6 * u2);
      shot.position.lerp(_scratch, Math.min(1, dt * 4));
      shot.target.lerp(_scratch2.copy(center).setY(center.y + 3 + 4.2 * u2), Math.min(1, dt * 5));
    } else {
      const u2 = easeOut(clamp((t2 - 3.1) / 1.6, 0, 1));
      _scratch
        .copy(center)
        .addScaledVector(this.dp, 20.5 - 1.5 * u2)
        .addScaledVector(this.sv, 1.5)
        .setY(center.y + 2.6 + 0.5 * u2);
      shot.position.lerp(_scratch, Math.min(1, dt * 3.5));
      shot.target.lerp(_scratch2.copy(boss.maskWorld).setY(boss.maskWorld.y - 3.9), Math.min(1, dt * 6));
    }
    if (this.once('roar', t2, 3.15)) {
      this.play('boss-roar', center, 1.2);
      this.emit('camera:shake', {
        strength: 1.2,
        position: center.clone(),
      });
      boss.hazards.shock(center.x, center.z, 16, 23, 0, _tint2.set(13616870), 0.5, 4);
      this.fx.ring(_scratch.set(center.x, center.y, center.z), 1, 22, 0.9, BURST_WHITE, 2);
      for (let i = 0; i < 4; i++) boss.crystals[i].flash = 1;
    }
    if (this.once('start', t2, 3.35)) {
      this.started = true;
      this.emit('boss:start', {
        name: 'Greymaw',
        position: center.clone(),
      });
      this.arena.setBarrier(true);
      this.play('barrier-up', center, 1);
    }
    if (t2 > 4.7 && this.shotOn) this.setShot(false);
    if (t2 > 5.05) {
      this.setControl(true);
      this.mode = 'fight';
      this.t = 0;
      boss.beginFight(this.startPhase);
      this.emit('boss:phase', {
        phase: boss.phase,
        name: PHASE_NAMES[boss.phase] ?? '',
      });
    }
  }
  stepFight(dt, dist, playerPos) {
    const state = this.ctx.player?.state;
    if (this.graceT <= 0 && state && !state.dead && (dist > 29 || playerPos.y < this.arena.floorY - 9)) {
      this.mode = 'resetting';
      this.resetDelay = 0;
      this.t = 0;
    }
  }
  stepReset(dt) {
    const boss = this.boss;
    this.resetDelay -= dt;
    if (!(this.resetDelay > 0)) {
      if (this.once('reset', this.t, 0)) {
        this.emit('boss:reset', {
          name: 'Greymaw',
        });
        boss.dismissSummons();
        boss.register(false);
        boss.hazards.clear();
        boss.setState('sinking');
        this.setShot(false);
        this.setControl(true);
        this.started = false;
        this.arena.setBarrier(false);
        this.play('barrier-down', this.arena.center, 1);
        this.play('boss-rise', this.arena.center, 0.6, 0.7);
        this.t = 0;
      }
      boss.pose.rise += (DORMANT_RISE - boss.pose.rise) * Math.min(1, dt * 0.9);
      boss.pose.set(CH.EYE, 0.4);
      if (this.t > 3.2) {
        boss.resetStats();
        boss.setState('dormant');
        this.mode = 'dormant';
        this.dyingDone.clear();
        this.nearT = -2;
      }
    }
  }
  beginDeath() {
    if (this.mode === 'dying' || this.defeated) return;
    const boss = this.boss;
    const center = this.arena.center;
    const playerPos = this.ctx.player?.state?.position ?? center.clone().addScaledVector(this.arena.stairDir, 12);
    this.dp.set(playerPos.x - center.x, 0, playerPos.z - center.z);
    if (this.dp.lengthSq() < 1) this.dp.copy(this.arena.stairDir);
    this.dp.normalize();
    this.sv.set(this.dp.z, 0, -this.dp.x);
    this.mode = 'dying';
    this.t = 0;
    this.realT = 0;
    this.dyingDone.clear();
    boss.setState('dying');
    boss.register(false);
    boss.hazards.clear();
    boss.pose.fistJitter[0].set(0, 0, 0);
    boss.pose.fistJitter[1].set(0, 0, 0);
    this.play('boss-death', center, 1.2);
    try {
      this.ctx.time.slowMo(0.3, 2.6);
    } catch {}
    this.setControl(false);
    this.shot.position
      .copy(center)
      .addScaledVector(this.dp, 23)
      .addScaledVector(this.sv, 5)
      .setY(center.y + 7);
    this.shot.target.copy(center).setY(center.y + 6);
    this.shot.blend = 0.6;
    this.setShot(true);
    this.emit('camera:shake', {
      strength: 0.8,
      position: center.clone(),
    });
  }
  stepDying(dt, realDt) {
    const boss = this.boss;
    const pose = boss.pose;
    const center = this.arena.center;
    const realT = this.realT;
    const rear = easeOut(clamp(realT / 1.2, 0, 1));
    pose.set(CH.SINK, 0);
    pose.set(CH.LEAN_P, -0.32 * rear);
    pose.set(CH.CHEST_P, -0.3 * rear);
    pose.set(CH.HEAD_P, -0.55 * rear);
    pose.set(CH.JAW, 0.95 * rear);
    pose.set(CH.MOUTH, 1.5);
    pose.set(CH.GLOW, 1.5);
    pose.set(CH.EYE, 1.5);
    pose.set(CH.ANGER, 0);
    pose.fist(0, 7.5, 3 + 6 * rear, 1.5);
    pose.fist(1, -7.5, 3 + 6 * rear, 1.5);
    pose.set(CH.LP_UP, 1.2);
    pose.set(CH.RP_UP, 1.2);
    const shake = smoothstep(0.3, 2.6, realT) * 0.12;
    pose.set(CH.CHEST_OX, rand(-shake, shake));
    pose.set(CH.CHEST_OZ, rand(-shake, shake));
    boss.setDeath(smoothstep(0.1, 2.7, realT));
    boss.pose.rise = 1;
    if (realT < 2.85) {
      const count = Math.round(2 + realT * 4);
      for (let i = 0; i < count; i++) {
        const surf = boss.model.rig.surface[Math.floor(Math.random() * boss.model.rig.surface.length)];
        pose.boneWorld(surf.bone, surf.pos, _scratch);
        const color = paintColor(COLORS[Math.floor(Math.random() * 4)], _tint2).lerp(BURST_WHITE, 0.4);
        this.fx.glows.spawn(
          this.fx.now,
          _scratch.x + rand(-1.5, 1.5),
          _scratch.y + rand(-1, 1),
          _scratch.z + rand(-1.5, 1.5),
          rand(-6, 6),
          rand(-2, 8),
          rand(-6, 6),
          rand(0.25, 0.5),
          rand(0.3, 0.6),
          color,
          3.5,
          0,
          2,
          2,
        );
      }
    }
    const shot = this.shot;
    _scratch
      .copy(center)
      .addScaledVector(this.dp, 23 - realT * 1.5)
      .addScaledVector(this.sv, 5)
      .setY(center.y + 7 + realT * 0.4);
    shot.position.lerp(_scratch, Math.min(1, realDt * 2));
    shot.target.lerp(_scratch2.copy(boss.headCenter), Math.min(1, realDt * 3));
    if (this.once('boom', realT, 2.85)) this.explode();
    if (realT > 2.85) {
      this.mode = 'victory';
      this.t = 0;
      this.realT = 0;
    }
  }
  explode() {
    const boss = this.boss;
    const center = this.arena.center;
    const floorY = this.arena.floorY;
    const burstPos = _scratch.copy(boss.bodyCenter);
    this.defeated = true;
    this.started = false;
    boss.setState('gone');
    boss.setVisible(false);
    boss.setDeath(0);
    this.arena.setBodyCollider(false);
    for (const color of COLORS) {
      paintColor(color, _tint2);
      this.fx.paintSplash(burstPos, color, 150, 16, 0.16);
      for (let i = 0; i < 14; i++) {
        const angle = Math.random() * TAU;
        const speed = rand(4, 11);
        this.fx.drops.spawn(
          this.fx.now,
          burstPos.x,
          burstPos.y,
          burstPos.z,
          Math.cos(angle) * speed,
          rand(8, 16),
          Math.sin(angle) * speed,
          rand(0.22, 0.38),
          rand(2.2, 3.4),
          floorY,
          _tint2,
          0.45,
          16,
          0.3,
        );
      }
      this.fx.sparks(burstPos, _tint2, 60, 18, 4, 0.18, 3);
      this.hazards().shock(center.x, center.z, 11 + COLORS.indexOf(color) * 2.5, 30, 0, _tint2, 1.2, 3);
      for (let i2 = 0; i2 < 25; i2++) {
        const angle = Math.random() * TAU;
        const dist = rand(8, 60);
        _scratch2.set(center.x + Math.cos(angle) * dist, floorY + rand(0, 20), center.z + Math.sin(angle) * dist);
        this.fx.streams.spawn(
          this.fx.now + i2 * 0.01,
          burstPos,
          _scratch2,
          rand(0.8, 1.6),
          _tint2,
          3,
          rand(0.25, 0.5),
          rand(4, 14),
          rand(0.5, 2),
          rand(0.3, 1),
          2.5,
        );
      }
    }
    const maskWorld = boss.maskWorld;
    for (let i = 0; i < 40; i++)
      this.fx.shards.spawn(
        this.fx.now,
        maskWorld.x + rand(-1.5, 1.5),
        maskWorld.y + rand(-1, 1),
        maskWorld.z + rand(-1.5, 1.5),
        rand(-9, 9),
        rand(4, 14),
        rand(-9, 9),
        rand(0.25, 0.55),
        rand(2.4, 3.6),
        floorY,
        _tint2.set(15854557),
        2,
        rand(4, 12),
      );
    for (let i = 0; i < 50; i++)
      this.fx.shards.spawn(
        this.fx.now,
        burstPos.x + rand(-3, 3),
        burstPos.y + rand(-3, 3),
        burstPos.z + rand(-3, 3),
        rand(-12, 12),
        rand(4, 16),
        rand(-12, 12),
        rand(0.2, 0.5),
        rand(1.6, 3),
        floorY,
        _tint2.set(2894387),
        1,
        rand(4, 12),
      );
    this.fx.glows.spawn(this.fx.now, burstPos.x, burstPos.y, burstPos.z, 0, 0, 0, 22, 0.55, BURST_WHITE, 3.5, 0, 1, 0);
    this.fx.glows.spawn(this.fx.now, burstPos.x, burstPos.y, burstPos.z, 0, 0, 0, 12, 1, VICTORY_GOLD, 2.5, 0, 1, 0);
    this.fx.ring(_scratch2.set(center.x, floorY, center.z), 1, 30, 1.4, BURST_WHITE, 3);
    this.emit('camera:shake', {
      strength: 1.6,
      position: center.clone(),
    });
    this.play('boss-slam', center, 1.2, 0.6);
    try {
      this.ctx.paint.bloomVitality(center.clone(), 150, 6);
      for (let i2 = 0; i2 < 18; i2++) {
        const angle = (i2 / 18) * TAU + rand(-0.2, 0.2);
        const dist = rand(4, 20.5);
        this.ctx.paint.paintSphere(
          _scratch2.set(center.x + Math.cos(angle) * dist, floorY + 0.05, center.z + Math.sin(angle) * dist),
          rand(1.3, 2.6),
          COLORS[i2 % 4],
          1,
        );
      }
    } catch {}
    this.arena.setBarrier(false);
    this.play('barrier-down', center, 1);
    boss.dismissSummons();
    this.emit('boss:defeated', {
      name: 'Greymaw',
      position: center.clone(),
    });
    try {
      this.ctx.ui.toast('Greymaw has fallen', 'The colour returns to the north');
    } catch {}
  }
  hazards() {
    return this.boss.hazards;
  }
  stepVictory(dt, realDt) {
    const center = this.arena.center;
    const floorY = this.arena.floorY;
    const realT = this.realT;
    this.victory = Math.min(1, this.victory + realDt / 4);
    this.clear = Math.min(1, this.clear + realDt / 5);
    if (realT < 3.5 && Math.random() < 0.8) {
      const angle = Math.random() * TAU;
      const dist = rand(0, 32);
      paintColor(COLORS[Math.floor(Math.random() * 4)], _tint2);
      this.fx.drops.spawn(
        this.fx.now,
        center.x + Math.cos(angle) * dist,
        floorY + rand(14, 22),
        center.z + Math.sin(angle) * dist,
        0,
        -rand(2, 6),
        0,
        rand(0.08, 0.18),
        3,
        floorY,
        _tint2,
        0.3,
        14,
        0.4,
      );
    }
    const shot = this.shot;
    if (realT < 2.6) {
      _scratch
        .copy(center)
        .addScaledVector(this.dp, 20)
        .addScaledVector(this.sv, 4)
        .setY(floorY + 6.5 + realT * 0.8);
      shot.position.lerp(_scratch, Math.min(1, realDt * 1.5));
      shot.target.lerp(_scratch2.copy(center).setY(floorY + 5 + realT * 2), Math.min(1, realDt * 2));
    }
    if (this.once('appear', realT, 2.6)) {
      this.play('chest-appear', center, 1);
      this.chest.setVisible(true);
      this.chest.setBeam(0.01);
    }
    if (realT > 2.6) {
      const chestT = realT - 2.6;
      this.chest.setBeam(Math.min(1, chestT / 0.6) * (1 - smoothstep(6.2, 7.6, chestT)));
      this.drain = Math.min(1, chestT / 2);
      const descent = clamp((chestT - 0.7) / 3.2, 0, 1);
      const height = floorY + 15 * (1 - easeOut(descent));
      this.chest.setHeight(height, (1 - easeOut(descent)) * 4);
      if (Math.random() < 0.7)
        this.fx.glows.spawn(
          this.fx.now,
          center.x + rand(-1.2, 1.2),
          height + rand(0, 6),
          center.z + rand(-1.2, 1.2),
          0,
          -rand(0.5, 2),
          0,
          rand(0.08, 0.16),
          rand(0.8, 1.4),
          VICTORY_GOLD,
          3,
          0,
          0.5,
          0.5,
        );
      const shot = this.shot;
      _scratch
        .copy(center)
        .addScaledVector(this.dp, 10.5)
        .addScaledVector(this.sv, 3)
        .setY(floorY + 3.4);
      shot.position.lerp(_scratch, Math.min(1, realDt * 1.2));
      shot.target.lerp(_scratch2.set(center.x, height + 1, center.z), Math.min(1, realDt * 3));
      if (this.once('land', chestT, 3.9)) {
        this.chest.setHeight(floorY, 0);
        this.chest.addCollider();
        this.fx.dust(_scratch.set(center.x, floorY, center.z), 12, 2, 0.9);
        this.fx.sparks(_scratch.set(center.x, floorY + 1, center.z), VICTORY_GOLD, 30, 5, 3.4, 0.1, 2);
        this.fx.ring(_scratch.set(center.x, floorY, center.z), 0.5, 5, 0.8, VICTORY_GOLD, 2.2);
        this.emit('camera:shake', {
          strength: 0.35,
          position: center.clone(),
        });
      }
      if (chestT > 5) {
        this.setShot(false);
        this.setControl(true);
        this.mode = 'chest';
        this.t = 0;
      }
    }
  }
  stepChest(dt, playerPos) {
    const chest = this.chest;
    const state = this.ctx.player?.state;
    const dist = Math.hypot(playerPos.x - chest.position.x, playerPos.z - chest.position.z);
    const dy = Math.abs(playerPos.y - chest.position.y);
    const canOpen = !!state && !state.dead && dist < 3.3 && dy < 2 && state.itemHold == null;
    if (canOpen !== this.promptOn) {
      this.promptOn = canOpen;
      try {
        if (canOpen) this.ctx.ui.showPrompt('chest', 'Open', 'F');
        else this.ctx.ui.hidePrompt('chest');
      } catch {}
    }
    if (Math.random() < 0.1)
      this.fx.glows.spawn(
        this.fx.now,
        chest.position.x + rand(-1, 1),
        chest.position.y + rand(0.3, 1.6),
        chest.position.z + rand(-1, 1),
        0,
        0.4,
        0,
        rand(0.06, 0.12),
        rand(0.6, 1.1),
        VICTORY_GOLD,
        3,
        0,
        1,
        0,
      );
    if (canOpen && this.ctx.input.pressed('interact')) this.beginOpen();
  }
  beginOpen() {
    const chest = this.chest;
    this.mode = 'opening';
    this.t = 0;
    this.realT = 0;
    this.promptOn = false;
    try {
      this.ctx.ui.hidePrompt('chest');
    } catch {}
    this.setControl(false);
    const stand = chest.standPoint(new Vector3(), 2);
    stand.y = chest.position.y + 0.05;
    try {
      this.ctx.player.teleport(stand, chest.facing + Math.PI);
    } catch {}
    const fwd = _scratch.set(Math.sin(chest.facing), 0, Math.cos(chest.facing));
    const side = _scratch2.set(fwd.z, 0, -fwd.x);
    this.shot.position
      .copy(chest.position)
      .addScaledVector(fwd, 4.4)
      .addScaledVector(side, 2.6)
      .setY(chest.position.y + 2.3);
    this.shot.target.copy(chest.position).setY(chest.position.y + 1.1);
    this.shot.blend = 0.7;
    this.setShot(true);
  }
  stepOpening(dt, realDt) {
    const chest = this.chest;
    const realT = this.realT;
    let lid = 0;
    if (realT > 0.45) lid = 0.14 * easeOut(clamp((realT - 0.45) / 0.25, 0, 1));
    if (realT > 0.95) lid = 0.14 + 1.76 * easeOut(clamp((realT - 0.95) / 0.7, 0, 1));
    chest.lidAngle = lid;
    this.chestRays = smoothstep(0.5, 1.4, realT);
    if (this.once('creak', realT, 0.45)) this.play('chest-open', chest.position, 1);
    if (this.once('burst', realT, 0.95)) {
      const lidTop = chest.lidTop;
      this.fx.sparks(lidTop, VICTORY_GOLD, 50, 6, 3.6, 0.12, -1);
      this.fx.glows.spawn(this.fx.now, lidTop.x, lidTop.y, lidTop.z, 0, 0, 0, 5, 0.5, VICTORY_GOLD, 3, 0, 1, 0);
      for (let i = 0; i < 30; i++) {
        const angle = Math.random() * TAU;
        _scratch.set(
          lidTop.x + Math.cos(angle) * rand(1, 3),
          lidTop.y + rand(3, 7),
          lidTop.z + Math.sin(angle) * rand(1, 3),
        );
        const color = paintColor(COLORS[i % 4], _tint2);
        this.fx.streams.spawn(this.fx.now + i * 0.02, lidTop, _scratch, rand(0.8, 1.4), color, 2.6, 0.16, 1, 0.8, 1, 2);
      }
      this.emit('chest:open', {
        position: chest.position.clone(),
        item: 'chromaBrush',
      });
    }
    const fwd = _scratch.set(Math.sin(chest.facing), 0, Math.cos(chest.facing));
    const side = _scratch2.set(fwd.z, 0, -fwd.x);
    const camPos = new Vector3()
      .copy(chest.position)
      .addScaledVector(fwd, 3.9)
      .addScaledVector(side, 2.2)
      .setY(chest.position.y + 2.1);
    this.shot.position.lerp(camPos, Math.min(1, realDt * 1.5));
    if (this.once('give', realT, 1.9)) {
      this.itemGiven = true;
      this.itemWait = 0;
      try {
        this.ctx.player.giveItem('chromaBrush');
      } catch (err) {
        console.warn('[boss] giveItem failed', err);
      }
    }
    if (this.itemGiven) {
      this.itemWait += realDt;
      const itemHold = this.ctx.player?.state?.itemHold;
      if ((this.itemWait > 1 && !itemHold) || this.itemWait > 9) {
        this.setShot(false);
        this.setControl(true);
        this.mode = 'opened';
      }
    }
  }
  applyDebugStart() {
    const debug = this.opts.debug;
    const center = this.arena.center;
    const boss = this.boss;
    const fightSpot = new Vector3().copy(center).addScaledVector(this.arena.stairDir, 18);
    fightSpot.y = this.arena.floorY + 0.1;
    const facing = Math.atan2(-this.arena.stairDir.x, -this.arena.stairDir.z);
    const teleport = (pos, yaw) => {
      try {
        this.ctx.player.teleport(pos, yaw);
      } catch {}
    };
    if (debug.has('defeated') || debug.has('chest')) {
      this.defeated = true;
      boss.setState('gone');
      boss.setVisible(false);
      this.arena.setBodyCollider(false);
      this.victory = 1;
      this.clear = 1;
      this.drain = 1;
      this.chest.setVisible(true);
      this.chest.setHeight(this.arena.floorY, 0);
      this.chest.addCollider();
      this.mode = 'chest';
      try {
        this.ctx.paint.bloomVitality(center.clone(), 150, 0.6);
      } catch {}
      if (debug.has('chest')) {
        const stand = this.chest.standPoint(new Vector3(), 2.4);
        stand.y = this.arena.floorY + 0.1;
        teleport(stand, this.chest.facing + Math.PI);
      } else teleport(fightSpot, facing);
      return;
    }
    const phase = debug.has('phase3') ? 3 : debug.has('phase2') ? 2 : 1;
    this.startPhase = phase;
    if (debug.has('intro')) {
      const pos = new Vector3().copy(center).addScaledVector(this.arena.stairDir, 19);
      pos.y = this.arena.floorY + 0.1;
      teleport(pos, facing);
      return;
    }
    if (debug.has('stair')) {
      const pos = this.arena.stairFoot.clone();
      pos.y += 0.2;
      teleport(pos, facing);
      return;
    }
    if (debug.has('fight') || phase > 1) {
      teleport(fightSpot, facing);
      this.dp.copy(this.arena.stairDir);
      boss.resetStats();
      boss.pose.rise = 1;
      boss.pose.yaw = Math.atan2(this.arena.stairDir.x, this.arena.stairDir.z);
      this.mode = 'fight';
      this.started = true;
      this.arena.setBarrier(true);
      boss.beginFight(phase);
      this.emit('boss:start', {
        name: 'Greymaw',
        position: center.clone(),
      });
      this.emit('boss:phase', {
        phase: boss.phase,
        name: PHASE_NAMES[boss.phase] ?? '',
      });
    }
  }
  once(flag, t, at) {
    if (this.dyingDone.has(flag) || t < at) {
      return false;
    } else {
      this.dyingDone.add(flag);
      return true;
    }
  }
  setShot(shotOn) {
    this.shotOn = shotOn;
    try {
      this.ctx.player.setCinematic(shotOn ? this.shot : null);
    } catch {}
  }
  setControl(control) {
    try {
      this.ctx.player.setControlEnabled(control);
    } catch {}
  }
  get cinematicActive() {
    return this.shotOn;
  }
  get shotRef() {
    return this.shot;
  }
  play(sound, pos, volume = 1, pitch) {
    try {
      this.ctx.audio?.play(sound, {
        position: pos.clone(),
        volume,
        pitch,
      });
    } catch {}
  }
  emit(type, payload) {
    try {
      this.ctx.events.emit(type, payload);
    } catch (err) {
      console.warn('[boss] emit failed', type, err);
    }
  }
}
