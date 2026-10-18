/**
 * Audio test panel, opened with ?audiotest: a button for every named sound and every footstep, hero, paint, combat, brush art, enemy, boss, flight, area and ambience cue, toggles for the audio overrides, an hour slider, music and volume controls, and a live readout of the audio engine.
 */
import { Vector3 } from 'three';
const PANEL_CSS = `
.wbat{position:fixed;right:10px;top:10px;bottom:10px;width:330px;z-index:5000;pointer-events:auto;overflow:auto;
  background:rgba(14,17,22,.88);color:#e9e4d8;font:12px/1.35 system-ui,sans-serif;border-radius:10px;padding:10px 12px;
  box-shadow:0 6px 30px rgba(0,0,0,.4);backdrop-filter:blur(6px)}
.wbat.min{bottom:auto;height:auto;overflow:hidden}
.wbat h3{margin:10px 0 5px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#9fb7c9}
.wbat .row{display:flex;flex-wrap:wrap;gap:4px}
.wbat button{background:#27313d;color:#e9e4d8;border:1px solid #3a4756;border-radius:6px;padding:3px 7px;font:inherit;cursor:pointer}
.wbat button:hover{background:#34414f}
.wbat button.on{background:#3f6b4a;border-color:#58d66b}
.wbat .meter{font:11px ui-monospace,monospace;white-space:pre;color:#cfe3c7;background:#0b0e12;border-radius:6px;padding:6px;margin-top:6px}
.wbat label{display:flex;align-items:center;gap:6px;margin:3px 0}
.wbat input[type=range]{flex:1}
.wbat .top{display:flex;justify-content:space-between;align-items:center}
`;
export function mountAudioTest(audio) {
  const { ctx, eng, sfx, amb, music } = audio;
  const style = document.createElement('style');
  style.textContent = PANEL_CSS;
  document.head.appendChild(style);
  const panel = document.createElement('div');
  panel.className = 'wbat';
  for (const type of ['mousedown', 'pointerdown', 'click', 'wheel', 'keydown'])
    panel.addEventListener(type, (e) => e.stopPropagation());
  document.body.appendChild(panel);
  const header = document.createElement('div');
  header.className = 'top';
  header.innerHTML = '<b>Wildbrush audio test</b>';
  const minimize = document.createElement('button');
  minimize.textContent = '–';
  minimize.onclick = () => panel.classList.toggle('min');
  header.appendChild(minimize);
  panel.appendChild(header);
  const meter = document.createElement('div');
  meter.className = 'meter';
  panel.appendChild(meter);
  const ensureStarted = () => {
    audio.unlock();
    if (!music.isStarted) audio.startGame();
  };
  const section = (title) => {
    const heading = document.createElement('h3');
    heading.textContent = title;
    panel.appendChild(heading);
    const row = document.createElement('div');
    row.className = 'row';
    panel.appendChild(row);
    return row;
  };
  const button = (row, label, action) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.onclick = () => {
      ensureStarted();
      setTimeout(
        () => {
          try {
            action();
          } catch (err) {
            console.warn('[audiotest]', err);
          }
        },
        eng.running ? 0 : 120,
      );
    };
    row.appendChild(btn);
    return btn;
  };
  const toggle = (row, label, onChange) => {
    let on = false;
    const btn = button(row, label, () => {
      on = !on;
      btn.classList.toggle('on', on);
      onChange(on);
    });
  };
  const ahead = (dist = 4) => {
    const camera = ctx.camera;
    const dir = new Vector3();
    camera.getWorldDirection(dir);
    return camera.position
      .clone()
      .addScaledVector(dir, dist)
      .add(new Vector3(0, -1, 0));
  };
  const heroPos = () => ctx.player?.state?.position?.clone?.() ?? ahead(5);
  let row = section('Named (ctx.audio.play)');
  for (const key of Object.keys(audio.NAMED))
    button(row, key, () =>
      audio.playNamed(key, {
        position: ahead(6),
      }),
    );
  row = section('Footsteps');
  for (const surface of ['grass', 'dirt', 'path', 'sand', 'rock', 'stone', 'wood', 'water', 'ice', 'paint', 'snow'])
    button(row, surface, () => {
      let steps = 0;
      const step = () => {
        sfx.step(surface, heroPos(), 0.7, steps % 2 ? 'left' : 'right');
        if (++steps < 6) setTimeout(step, 330);
      };
      step();
    });
  row = section('Hero');
  button(row, 'jump', () => sfx.jump(heroPos()));
  button(row, 'land soft', () => sfx.land(heroPos(), 5, 'grass'));
  button(row, 'land heavy', () => sfx.land(heroPos(), 15, 'rock'));
  button(row, 'land water', () => sfx.land(heroPos(), 10, 'water'));
  button(row, 'bounce', () => sfx.bounce(heroPos(), 8 + Math.random() * 16));
  button(row, 'glide open', () => sfx.mode('air', 'glide'));
  button(row, 'glide close', () => sfx.mode('glide', 'air'));
  button(row, 'grab wall', () => sfx.mode('air', 'climb'));
  button(row, 'swim enter', () => sfx.mode('air', 'swim'));
  button(row, 'swim stroke', () =>
    eng.play('swim-stroke', {
      pos: heroPos(),
      gain: 0.2,
    }),
  );
  button(row, 'heartbeat', () =>
    eng.play('heartbeat', {
      gain: 0.25,
    }),
  );
  button(row, 'exhausted', () =>
    eng.play('breath-heavy', {
      pos: heroPos(),
      gain: 0.25,
    }),
  );
  button(row, 'respawn', () => audio.playNamed('respawn'));
  row = section('Paint');
  const colors = ['red', 'blue', 'yellow', 'green'];
  button(row, 'throw', () => sfx.throwPaint(heroPos(), colors[Math.floor(Math.random() * 4)]));
  for (const color of colors)
    button(row, `splat ${color}`, () =>
      sfx.splat({
        position: ahead(7),
        normal: new Vector3(0, 1, 0),
        color,
        radius: 1.5,
        surface: 'world',
      }),
    );
  for (const color of colors)
    button(row, `water ${color}`, () =>
      sfx.splat({
        position: ahead(7),
        normal: new Vector3(0, 1, 0),
        color,
        radius: 1.5,
        surface: 'water',
      }),
    );
  button(row, 'ink empty', () => sfx.inkEmpty());
  for (const color of colors) button(row, `select ${color}`, () => sfx.color(color));
  row = section('Combat — hero');
  const swingPos = () => ctx.player?.state?.position?.clone?.() ?? ahead(5);
  const { combat, battle } = audio;
  for (const swing of ['slash1', 'slash2', 'slash3', 'spin', 'jumpSlash', 'flurry'])
    button(row, swing, () => combat.swing(swing, swingPos()));
  button(row, 'flurry x8', () => {
    for (let i = 0; i < 8; i++) setTimeout(() => combat.swing('flurry', swingPos()), i * 70);
  });
  button(row, 'charge → spin', () => {
    const t0 = performance.now();
    const tick = () => {
      const held = (performance.now() - t0) / 1000;
      if (held < 1.6) {
        combat.chargeOverride = Math.min(1, held / 1.1);
        requestAnimationFrame(tick);
      } else {
        combat.chargeOverride = null;
        combat.swing('spin', swingPos());
      }
    };
    tick();
  });
  button(row, 'hurt ½', () => combat.hurt(0.5));
  button(row, 'hurt 1½', () => combat.hurt(1.5));
  button(row, 'death', () => combat.heroDeath());
  button(row, 'heart pickup', () => combat.pickup('heart', swingPos()));
  button(row, 'ink pickup', () => combat.pickup('ink', swingPos()));
  button(row, 'lock on', () => combat.lock(Math.floor(Math.random() * 1000)));
  button(row, 'lock off', () => combat.lock(null));
  button(row, 'perfect dodge', () => combat.perfectDodge());
  button(row, 'masterstroke run', () => combat.flurry());
  row = section('Brush Arts');
  {
    const { arts } = audio;
    const colorArts = [
      ['red', 'fireball'],
      ['blue', 'iceLance'],
      ['yellow', 'bounceOrb'],
      ['green', 'vineLash'],
    ];
    const chargeCast = (color, art, hold, hitFoe) => {
      const t0 = performance.now();
      const tick = () => {
        const held = (performance.now() - t0) / 1000;
        if (held < hold) {
          arts.chargeOverride = {
            color,
            charge: Math.min(1, held / 0.6),
          };
          requestAnimationFrame(tick);
          return;
        }
        arts.chargeOverride = null;
        arts.cast(art, color, swingPos());
        const impacts = art === 'bounceOrb' ? 5 : art === 'iceLance' ? 3 : 1;
        const delay = art === 'vineLash' ? 110 : art === 'iceLance' ? 280 : art === 'bounceOrb' ? 420 : 520;
        for (let i = 0; i < impacts; i++)
          setTimeout(
            () => arts.impact(art, color, ahead(9 + i * 2), hitFoe || (art === 'bounceOrb' && i < impacts - 1)),
            delay + i * (art === 'bounceOrb' ? 330 : 60),
          );
      };
      tick();
    };
    for (const [color, art] of colorArts) button(row, `${art} (charged)`, () => chargeCast(color, art, 0.9, false));
    for (const [color, art] of colorArts) button(row, `${art} → foe`, () => chargeCast(color, art, 0.9, true));
    for (const [color, art] of colorArts) button(row, `cast ${art}`, () => arts.cast(art, color, swingPos()));
    for (const [color, art] of colorArts) button(row, `impact ${art}`, () => arts.impact(art, color, ahead(9), false));
    for (const [color, art] of colorArts) button(row, `hit ${art}`, () => arts.impact(art, color, ahead(9), true));
    for (const [color] of colorArts)
      toggle(
        row,
        `hum ${color}`,
        (on) =>
          (arts.chargeOverride = on
            ? {
                color,
                charge: 0.75,
              }
            : null),
      );
    for (const [color] of colorArts) button(row, `ready ${color}`, () => arts.readyPing(color, true));
    button(row, 'ready (no ink)', () => arts.readyPing('red', false));
    button(row, 'fizzle', () => arts.fizzle());
    button(row, 'orb chain ×5', () => {
      for (let i = 0; i < 5; i++) setTimeout(() => arts.impact('bounceOrb', 'yellow', ahead(8 + i), true), i * 330);
    });
  }
  row = section('Combat — hits');
  let nextEnemyId = 100;
  const hit = (kind, color, killed = false, damage = 1) =>
    combat.hit({
      enemyId: nextEnemyId++,
      kind,
      position: ahead(6),
      damage,
      color,
      source: 'melee',
      killed,
    });
  button(row, 'plain', () => hit('smudgeling', null));
  for (const color of colors) button(row, color, () => hit('smudgeling', color));
  button(row, 'finisher', () => hit('smudgeling', null, false, 1.5));
  button(row, 'kill smudge', () => {
    hit('smudgeling', 'red', true);
    setTimeout(() => combat.death(nextEnemyId, 'smudgeling', ahead(6), 'red'), 60);
  });
  button(row, 'kill brute', () => {
    hit('brute', 'yellow', true, 2);
    setTimeout(() => combat.death(nextEnemyId, 'brute', ahead(6), 'yellow'), 60);
  });
  button(row, 'shatter', () => {
    const id = nextEnemyId++;
    combat.status({
      id,
      kind: 'smudgeling',
      status: 'frozen',
      on: true,
      position: ahead(6),
    });
    setTimeout(
      () =>
        combat.hit({
          enemyId: id,
          kind: 'smudgeling',
          position: ahead(6),
          damage: 2,
          color: null,
          source: 'melee',
          killed: false,
        }),
      500,
    );
  });
  for (const color of colors)
    button(row, `burst ${color}`, () => combat.death(nextEnemyId++, 'smudgeling', ahead(6), color));
  row = section('Combat — enemies');
  const kinds = ['smudgeling', 'spitter', 'brute'];
  for (const kind of kinds) button(row, `alert ${kind}`, () => combat.alert(kind, ahead(8)));
  for (const kind of kinds)
    button(row, `telegraph ${kind}`, () => combat.telegraph(kind, kind === 'brute' ? 0.9 : 0.55, ahead(8)));
  for (const kind of kinds) button(row, `attack ${kind}`, () => combat.attack(kind, ahead(8)));
  for (const sound of [
    'smudge-chitter',
    'smudge-hurt',
    'spitter-hiss',
    'glob-splat',
    'brute-growl',
    'brute-step',
    'smudge-step',
  ])
    button(row, sound, () =>
      eng.play(sound, {
        pos: ahead(8),
        gain: 0.3,
      }),
    );
  row = section('Battle music');
  button(row, 'fight', () => battle.debugStart(false));
  button(row, 'fight (brute)', () => battle.debugStart(true));
  toggle(row, 'heavy', (on) => (battle.heavy = on));
  button(row, 'end: victory', () => battle.debugStop(true));
  button(row, 'end: escaped', () => battle.debugStop(false));
  button(row, 'cut (death)', () => battle.kill());
  row = section('Boss & rewards (ctx.audio.play)');
  for (const sound of [
    'boss-rise',
    'boss-roar',
    'boss-slam',
    'boss-sweep',
    'boss-rain',
    'boss-crystal',
    'boss-stagger',
    'boss-hurt',
    'boss-death',
    'barrier-up',
    'barrier-down',
    'chest-appear',
    'chest-open',
    'item-get',
    'heart-get',
    'elite-sting',
  ])
    button(row, sound, () =>
      audio.playNamed(sound, {
        position: ahead(14),
      }),
    );
  button(row, 'item get → heart (event)', () =>
    ctx.events.emit('item:get', {
      item: 'heartContainer',
      position: heroPos(),
    }),
  );
  row = section('Boss music (Greymaw)');
  const { bossMusic } = audio;
  button(row, 'start (phase 1)', () => bossMusic.start());
  button(row, 'phase 2', () => bossMusic.setPhase(2));
  button(row, 'phase 3', () => bossMusic.setPhase(3));
  button(row, 'defeated', () => bossMusic.victory());
  button(row, 'reset (fade)', () => bossMusic.reset());
  row = section('Brushflight — the Perch & flying');
  const { flightSfx, perchHum, flightMusic } = audio;
  for (const sound of [
    'perch-socket',
    'perch-rumble',
    'perch-bloom',
    'perch-claim',
    'fly-mount',
    'fly-dismount',
    'fly-boost',
  ])
    button(row, sound, () =>
      audio.playNamed(sound, {
        position: ahead(10),
      }),
    );
  button(row, 'awakening (rumble → bloom)', () => {
    audio.playNamed('perch-rumble');
    setTimeout(() => audio.playNamed('perch-bloom'), 2550);
  });
  toggle(row, 'relic hum', (on) => (perchHum.force = on));
  toggle(row, 'fly 14 m/s', (on) => {
    flightSfx.overrides.fly = on ? true : undefined;
    flightSfx.overrides.speed = on ? 14 : undefined;
  });
  toggle(row, 'fly 32 m/s', (on) => {
    flightSfx.overrides.fly = on ? true : undefined;
    flightSfx.overrides.speed = on ? 32 : undefined;
  });
  toggle(row, 'boost', (on) => (flightSfx.overrides.boost = on ? true : undefined));
  toggle(row, 'paint stream', (on) => (flightSfx.overrides.paint = on ? true : undefined));
  row = section('Flight music (Skyward Stroke)');
  button(row, 'start (soft)', () => flightMusic.debugStart(0.45));
  button(row, 'start (full)', () => flightMusic.debugStart(0.95));
  button(row, 'stop', () => flightMusic.debugStop());
  row = section('Elite battle music');
  for (const color of ['red', 'blue', 'yellow', 'green'])
    button(row, `elite ${color}`, () => {
      combat.markElite(color, false);
      battle.debugStart(true);
      battle.elite = color;
    });
  button(row, 'elite sting', () => combat.markElite('red', true));
  for (const attack of ['charge', 'nova', 'spikes', 'volley', 'pound']) {
    button(row, `${attack} wind-up`, () =>
      eng.play(`el-${attack}-wind`, {
        pos: ahead(9),
        gain: 0.5,
      }),
    );
    button(row, attack, () =>
      eng.play(`el-${attack}`, {
        pos: ahead(9),
        gain: 0.6,
      }),
    );
  }
  row = section('The Painted Aerie');
  toggle(row, 'on the Aerie (ambience + music)', (on) => (audio.sky.force = on));
  button(row, 'discovery sting', () => audio.playNamed('area-discover'));
  button(row, 'area card + sting', () =>
    ctx.events.emit('area:enter', {
      id: 'aerie',
      name: 'The Painted Aerie',
      subtitle: 'Isles of the First Painters',
    }),
  );
  button(row, 'stamina vessel', () => audio.playNamed('vessel-get'));
  button(row, 'sky mantle', () => audio.playNamed('mantle-get'));
  button(row, 'vine wrap', () =>
    audio.playNamed('vine-wrap', {
      position: heroPos(),
    }),
  );
  button(row, 'vine free', () =>
    audio.playNamed('vine-free', {
      position: heroPos(),
    }),
  );
  button(row, 'wind gust', () =>
    audio.playNamed('wind-gust', {
      position: ahead(5),
    }),
  );
  button(row, 'storm crackle', () =>
    audio.playNamed('storm-crackle', {
      position: ahead(7),
    }),
  );
  button(row, 'wind chime', () => audio.sky.debugChime());
  button(row, 'aerie phrase', () => {
    music.moodOverride = 'aerie';
    music.debugPhraseNow();
  });
  row = section('Caves & temples');
  {
    const { areas } = audio;
    for (const area of ['cave', 'kiln', 'cistern'])
      button(row, `in the ${area} (amb + reverb + score)`, () => areas.setForce(area));
    button(row, 'outdoors', () => areas.setForce(null));
    toggle(row, 'lantern hum', (on) => (areas.forceLantern = on));
    for (const sound of [
      'cave-enter',
      'kiln-enter',
      'cistern-enter',
      'puzzle-solved',
      'lantern-get',
      'ember-crest-get',
      'frost-crest-get',
      'cloudstep-get',
    ])
      button(row, sound, () => audio.playNamed(sound));
    button(row, 'puzzle solved (event)', () =>
      ctx.events.emit('puzzle:solved', {
        id: 'audiotest',
        area: 'audiotest',
        position: heroPos(),
      }),
    );
    for (const item of ['lantern', 'emberCrest', 'frostCrest', 'cloudstep'])
      button(row, `item get → ${item} (event)`, () =>
        ctx.events.emit('item:get', {
          item,
          position: heroPos(),
        }),
      );
    button(row, 'double jump puff', () =>
      audio.playNamed('double-jump', {
        position: heroPos(),
      }),
    );
    button(row, 'flame ring', () =>
      audio.playNamed('flame-ring', {
        position: ahead(8),
      }),
    );
    button(row, 'frost path ×6', () => {
      for (let i = 0; i < 6; i++)
        setTimeout(
          () =>
            eng.play('frost-crackle', {
              pos: ahead(4 + i * 1.7),
              gain: 0.3,
              variation: i % 4,
            }),
          i * 45,
        );
    });
    button(row, 'lantern tinkle', () =>
      audio.playNamed('lantern-tinkle', {
        position: heroPos(),
      }),
    );
    button(row, 'cave drip', () =>
      eng.play('cave-drip', {
        pos: ahead(7),
        gain: 0.2,
        wet: 0.4,
        variation: Math.floor(Math.random() * 6),
      }),
    );
    button(row, 'icy chime', () =>
      eng.play('cistern-chime', {
        pos: ahead(9),
        gain: 0.12,
        wet: 0.5,
        variation: Math.floor(Math.random() * 5),
      }),
    );
    button(row, 'kiln pop', () =>
      eng.play('kiln-pop', {
        pos: ahead(7),
        gain: 0.2,
        wet: 0.3,
        variation: Math.floor(Math.random() * 4),
      }),
    );
    for (const area of ['cave', 'kiln', 'cistern'])
      button(row, `${area} phrase`, () => {
        music.moodOverride = area;
        music.debugPhraseNow();
      });
  }
  row = section('Elements & props');
  button(row, 'ignite', () => sfx.fireIgnite(ahead(8)));
  button(row, 'extinguish', () =>
    eng.play('fire-out', {
      pos: ahead(8),
      gain: 0.25,
    }),
  );
  button(row, 'freeze', () =>
    eng.play('ice-freeze', {
      pos: ahead(8),
      gain: 0.4,
      wet: 0.25,
    }),
  );
  button(row, 'melt', () =>
    eng.play('ice-melt', {
      pos: ahead(8),
      gain: 0.25,
      wet: 0.25,
    }),
  );
  button(row, 'steam', () =>
    eng.play('steam', {
      pos: ahead(8),
      gain: 0.25,
      wet: 0.2,
    }),
  );
  for (const prop of ['crate', 'barrel', 'boulder', 'ball'])
    button(row, prop, () => sfx.propImpact(ahead(6), prop, 3 + Math.random() * 9));
  row = section('Ambience');
  toggle(row, 'fire nearby', (on) => (amb.overrides.fire = on ? 1 : undefined));
  toggle(row, 'glide 18 m/s', (on) => {
    amb.overrides.speed = on ? 18 : undefined;
    amb.overrides.glide = on ? true : undefined;
  });
  toggle(row, 'fall 30 m/s', (on) => (amb.overrides.speed = on ? 30 : undefined));
  toggle(row, 'by the sea', (on) => (amb.overrides.ocean = on ? 0.4 : undefined));
  toggle(row, 'sliding', (on) => (amb.overrides.slide = on ? true : undefined));
  button(row, 'bird', () => amb.debugCritter('bird'));
  button(row, 'owl', () => amb.debugCritter('owl'));
  button(row, 'frog', () => amb.debugCritter('frog'));
  const hourLabel = document.createElement('label');
  hourLabel.innerHTML = '<span>hour</span>';
  const hourSlider = document.createElement('input');
  hourSlider.type = 'range';
  hourSlider.min = '0';
  hourSlider.max = '24';
  hourSlider.step = '0.25';
  hourSlider.value = String(amb.hour());
  const hourValue = document.createElement('span');
  hourSlider.oninput = () => {
    const hour = Number(hourSlider.value);
    amb.overrides.hour = hour;
    try {
      ctx.environment?.setTimeOfDay?.(hour);
    } catch {}
  };
  hourLabel.append(hourSlider, hourValue);
  panel.appendChild(hourLabel);
  row = section('Music');
  button(row, 'phrase now', () => music.debugPhraseNow());
  button(row, 'trial swell', () => music.swell(0.3));
  button(row, 'full theme', () => music.fullTheme(0.3));
  button(row, 'stop', () => music.debugStop());
  for (const mood of ['auto', 'day', 'dusk', 'night', 'aerie', 'cave', 'kiln', 'cistern'])
    button(row, mood, () => (music.moodOverride = mood === 'auto' ? null : mood));
  const slider = (label, getValue, setValue) => {
    const labelEl = document.createElement('label');
    labelEl.innerHTML = `<span style="width:48px">${label}</span>`;
    const inputEl = document.createElement('input');
    inputEl.type = 'range';
    inputEl.min = '0';
    inputEl.max = '1';
    inputEl.step = '0.01';
    inputEl.value = String(getValue());
    inputEl.oninput = () => setValue(Number(inputEl.value));
    labelEl.appendChild(inputEl);
    panel.appendChild(labelEl);
  };
  section('Volume');
  const volumes = {
    master: ctx.settings?.masterVolume ?? 0.8,
    music: ctx.settings?.musicVolume ?? 0.6,
  };
  slider(
    'master',
    () => volumes.master,
    (value) => {
      volumes.master = value;
      eng.setVolumes(volumes.master, volumes.music);
    },
  );
  slider(
    'music',
    () => volumes.music,
    (value) => {
      volumes.music = value;
      eng.setVolumes(volumes.master, volumes.music);
    },
  );
  let maxPeak = -120;
  const updateMeter = () => {
    requestAnimationFrame(updateMeter);
    const levels = eng.meter();
    if (levels) maxPeak = Math.max(maxPeak, levels.peakDb);
    hourValue.textContent = amb.hour().toFixed(1);
    meter.textContent = `ctx ${eng.ac?.state ?? 'none'}  bank ${eng.bank.loaded}/${eng.bank.total}${eng.bank.errors.length ? ' ERR ' + eng.bank.errors.length : ''}\nvoices ${eng.voicesBusy()}  fires ${amb.firesTracked}  mood ${music.lastMood}\npeak ${levels ? levels.peakDb.toFixed(1) : '--'} dB  rms ${levels ? levels.rmsDb.toFixed(1) : '--'} dB  max ${maxPeak.toFixed(1)}\nocean ${amb.ocean.toFixed(2)} lake ${amb.lake.toFixed(2)} grass ${amb.grass.toFixed(2)} vit ${amb.vitality.toFixed(2)}\nnext phrase ${music.isStarted ? music.secondsToNextPhrase.toFixed(1) + 's' : '—'}  queued ${music.queued}\nbattle ${audio.battle.state}${music.isSuspended ? '  (score suspended)' : ''}\nboss ${audio.bossMusic.describe}\nflight ${audio.flightMusic.describe}${flightSfx.isFlying ? '  (flying)' : ''}\naerie ${audio.sky.factor.toFixed(2)}${music.aerie ? '  (aerie score)' : ''}\nindoors ${audio.areas.describe}`;
  };
  updateMeter();
}
