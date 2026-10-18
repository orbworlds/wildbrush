#!/usr/bin/env node
// Two players in one browser, joined by a stand-in for Orb (window.orb whose room is a
// BroadcastChannel, whose visitors carry poses over it and whose shop says yes): checks that a
// newcomer is painted the splats made before they came, that a blob thrown by one lands in the
// other's world both ways, that a scarf, a hood and a glider bought in the wardrobe are worn (the
// scarf wrap and all), that the Wardrobe tab has a tile per look and one note, and that each sees
// the other as a hero: in the looks they wear, jumping, flicking the brush as they throw, walking
// on while you're in the pause menu, and gone when they leave. The real Orb room, visitors and
// shop are covered by Orb's own tests.
//
//   node tools/serve.mjs &  node tools/test-together.mjs [url=http://127.0.0.1:8000/] [shot.png]
import { launch } from '../../../scripts/pw.mjs';

const url = process.argv[2] ?? 'http://127.0.0.1:8000/';
const shotPath = process.argv[3];
const FAKE_ORB = (name) => `(() => {
  // both players share one screen here: a pointer lock lost to the other page would pause the game
  HTMLCanvasElement.prototype.requestPointerLock = function () { return Promise.resolve(); };
  const channel = new BroadcastChannel('wildbrush-test-room');
  const me = { id: ${JSON.stringify(name)} + '-' + Math.random().toString(36).slice(2, 8), name: ${JSON.stringify(name)}, color: '#8b7bff', wears: [], state: null };
  const owned = new Set();
  const handlers = [];
  channel.onmessage = ({ data: d }) => { if (d && d.from !== me.id) for (const handle of handlers) handle(d); };
  window.__orbTest = { sent: 0, bought: [], leave: () => channel.postMessage({ t: 'bye', from: me.id }) };
  // orb.visitors.show much as Orb runs it: your pose sampled every 100 ms, theirs smoothed (x, y, z,
  // ry) as it arrives, avatar(v) for each of them, gone with a null pose or when they leave
  const NOT_POSE = ['id', 'name', 'color', 'wears', 'friend', 'state'];
  const SMOOTH = ['x', 'y', 'z', 'ry'];
  function show(o) {
    const byId = new Map();
    const on = { join: [], leave: [] };
    let list = [];
    const relist = () => { list = [...byId.values()].map((r) => r.v); };
    const clean = (p) => {
      if (!p) return null;
      const out = {};
      for (const k of Object.keys(p).filter((k) => !NOT_POSE.includes(k)).slice(0, 24)) {
        const x = p[k];
        if (typeof x === 'number' && isFinite(x)) out[k] = Math.round(x * 100) / 100;
        else if (typeof x === 'string') out[k] = x.slice(0, 64);
        else if (typeof x === 'boolean') out[k] = x;
      }
      return out;
    };
    setInterval(() => channel.postMessage({ t: 'pose', from: me.id, peer: me, pose: clean(o.pose()) }), 100);
    const drop = (id) => {
      const r = byId.get(id);
      if (!r) return;
      byId.delete(id);
      r.group.removeFromParent();
      relist();
      for (const fn of on.leave) fn(r.v);
    };
    handlers.push((d) => {
      if (d.t === 'bye') return drop(d.from);
      if (d.t !== 'pose') return;
      if (!d.pose) return drop(d.from);
      let r = byId.get(d.from);
      if (!r) {
        const v = { id: d.from, name: d.peer.name, color: d.peer.color, wears: [], friend: false, state: null };
        for (const k of SMOOTH) v[k] = d.pose[k];
        r = { v, to: {}, group: new o.THREE.Group() };
        const model = o.avatar ? o.avatar(v) : null;
        if (model) r.group.add(model);
        o.scene.add(r.group);
        byId.set(d.from, r);
        relist();
        for (const fn of on.join) fn(v);
      }
      for (const k of Object.keys(r.v)) if (!NOT_POSE.includes(k) && !SMOOTH.includes(k) && !(k in d.pose)) delete r.v[k];
      for (const k of Object.keys(d.pose)) if (SMOOTH.includes(k)) r.to[k] = d.pose[k]; else r.v[k] = d.pose[k];
      r.v.state = d.pose;
    });
    let last = performance.now();
    const tick = (now) => {
      const a = 1 - Math.exp(-Math.min(0.1, Math.max(0, now - last) / 1000) * 10);
      last = now;
      for (const r of byId.values())
        for (const k of SMOOTH) {
          if (typeof r.to[k] !== 'number') continue;
          const d = r.to[k] - r.v[k];
          r.v[k] += (k === 'ry' ? Math.atan2(Math.sin(d), Math.cos(d)) : d) * a;
        }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return { get list() { return list; }, get count() { return byId.size; }, on: (type, fn) => on[type].push(fn), leave() {} };
  }
  window.orb = {
    me, world: { id: 'test', name: 'Wildbrush' },
    room: {
      join(cb) {
        const peers = new Map();
        handlers.push((d) => {
          // as on Orb, a newcomer knows who's here before anyone hears from it
          if (d.t === 'hello' && !peers.has(d.peer.id)) {
            peers.set(d.peer.id, d.peer);
            channel.postMessage({ t: 'hello', peer: me, from: me.id });
            cb({ type: 'join', peer: d.peer });
          } else if (d.t === 'msg' && peers.has(d.from)) cb({ type: 'message', peer: peers.get(d.from), data: d.data });
          else if (d.t === 'bye' && peers.has(d.from)) {
            const peer = peers.get(d.from);
            peers.delete(d.from);
            cb({ type: 'leave', peer });
          }
        });
        channel.postMessage({ t: 'hello', peer: me, from: me.id });
        setTimeout(() => cb({ type: 'joined', self: me, peers: [...peers.values()], live: true }), 800);
        return { name: '', peers, get self() { return me; }, send(data) { window.__orbTest.sent++; channel.postMessage({ t: 'msg', from: me.id, data: JSON.parse(JSON.stringify(data)) }); }, setState() {}, leave() {} };
      },
    },
    visitors: { show, join: () => ({ list: [], count: 0, on() {}, leave() {} }) },
    shop: {
      items: async () => [],
      owned: async () => [...owned],
      buy: async (id) => { owned.add(id); window.__orbTest.bought.push(id); return { ok: true, item: id }; },
    },
    toast() {},
  };
})();`;

const browser = await launch();
const context = await browser.newContext({ viewport: { width: 480, height: 270 } });
const failures = [];
const check = (label, ok, detail) => {
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : ` — ${JSON.stringify(detail)}`}`);
  if (!ok) failures.push(label);
};

async function player(name) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)));
  await page.addInitScript(FAKE_ORB(name));
  // audio stubbed: two copies of the game share this machine's CPU
  await page.goto(url + '?quality=low&stub=audio', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__wb?.ready, null, { timeout: 600000, polling: 1000 });
  await page.evaluate(() => document.querySelector('.wb-title')?.click());
  // count every splat that lands in this world, local or remote
  await page.evaluate(() => {
    window.__splats = 0;
    window.__wb.ctx.events.on('paint:splat', () => window.__splats++);
  });
  return { page, errors };
}
/** A blob thrown from in front of the hero towards the ground a few metres ahead. */
const THROW = (color) => {
  const { ctx } = window.__wb;
  const p = ctx.player.state.position;
  const from = p.clone().add({ x: 0, y: 1.6, z: -0.6 });
  const to = p.clone().add({ x: 0, y: 0, z: -7 });
  to.y = ctx.terrain.heightAt(to.x, to.z);
  ctx.paint.addInk(color, 100);
  return ctx.paint.throwBlob(from, ctx.paint.launchVelocity(from, to), color);
};
const waitFor = (page, fn, arg, timeout = 240000) => page.waitForFunction(fn, arg, { timeout, polling: 500 }).then(() => true, () => false);

const ada = await player('Ada');
check('Ada boots with every system real (audio stubbed)', await ada.page.evaluate(() => Object.entries(window.__wb.services).every(([k, s]) => s === (k === 'audio' ? 'stub' : 'real'))), await ada.page.evaluate(() => window.__wb.services));
check('Ada throws before anyone else is here', await ada.page.evaluate(THROW, 'red'));
check('…and her blob lands', await waitFor(ada.page, () => window.__splats >= 1));

const ben = await player('Ben');
check('Ben is painted the splats made before he came', await waitFor(ben.page, () => window.__wb.ctx.multiplayer.stats.painted >= 1), await ben.page.evaluate(() => window.__wb.ctx.multiplayer.stats));
const benSplats = await ben.page.evaluate(() => window.__splats);
check('Ada throws again', await ada.page.evaluate(THROW, 'blue'));
check('…and it lands in Ben’s world', await waitFor(ben.page, (n) => window.__wb.ctx.multiplayer.stats.thrown >= 1 && window.__splats > n, benSplats), await ben.page.evaluate(() => ({ stats: window.__wb.ctx.multiplayer.stats, splats: window.__splats })));
const adaSplats = await ada.page.evaluate(() => window.__splats);
check('Ben throws', await ben.page.evaluate(THROW, 'green'));
check('…and it lands in Ada’s world', await waitFor(ada.page, (n) => window.__wb.ctx.multiplayer.stats.thrown >= 1 && window.__splats > n, adaSplats), await ada.page.evaluate(() => ({ stats: window.__wb.ctx.multiplayer.stats, splats: window.__splats })));
check('a remote throw spends none of your ink', await ben.page.evaluate(() => window.__wb.ctx.paint.ink.blue === 100), await ben.page.evaluate(() => window.__wb.ctx.paint.ink));

// the wardrobe: buy a scarf through the (stand-in) shop and wear it
const scarf = () => {
  const mesh = window.__wb.ctx.scene.getObjectByName('hero-scarf');
  const c = mesh.geometry.getAttribute('color');
  return [c.getX(0), c.getY(0), c.getZ(0)].map((x) => +x.toFixed(3));
};
const before = await ada.page.evaluate(scarf);
await ada.page.evaluate(() => window.__wb.ctx.wardrobe.buy('scarf-frost'));
check('the Frost Scarf is bought and worn', await ada.page.evaluate(() => window.__wb.ctx.wardrobe.worn.scarf === 'scarf-frost' && window.__orbTest.bought.includes('scarf-frost')));
const after = await ada.page.evaluate(scarf);
check('…and the hero’s scarf turns blue', after[2] > after[0] && JSON.stringify(after) !== JSON.stringify(before), { before, after });
const wrap = () => window.__wbChar.hero.mats.scarf.base.value.toArray().map((x) => +x.toFixed(3));
check('…its wrap and knot too', await ada.page.evaluate(() => { const [r, , b] = window.__wbChar.hero.mats.scarf.base.value.toArray(); return b > r + 0.2; }), await ada.page.evaluate(wrap));
await ada.page.evaluate(() => window.__wb.ctx.wardrobe.wear('scarf-classic'));
check('the Classic Scarf goes back on', JSON.stringify(await ada.page.evaluate(scarf)) === JSON.stringify(before));
// a hood and a glider
const hoodOf = () => window.__wbChar.hero.mats.hood.base.value.getHexString();
const hoodBefore = await ada.page.evaluate(hoodOf);
await ada.page.evaluate(() => window.__wb.ctx.wardrobe.buy('hood-plum'));
check('the Plum Hood is bought and worn, and the hood turns plum', await ada.page.evaluate(() => window.__wb.ctx.wardrobe.worn.hood === 'hood-plum') && (await ada.page.evaluate(hoodOf)) === '5f3b80', { before: hoodBefore, after: await ada.page.evaluate(hoodOf) });
// the canopy's middle panel, in its texture: gold for the Starry Glider (teal for the classic)
const middlePanel = () => {
  const glider = window.__wbChar.hero.group.getObjectByName('hero-glider');
  const canvas = glider?.children.find((c) => c.material?.map)?.material.map.image;
  if (!canvas) return [];
  const g = canvas.getContext('2d');
  return [40, 70, 110].map((y) => [...g.getImageData(256, y, 1, 1).data.slice(0, 3)]);
};
await ada.page.evaluate(() => window.__wb.ctx.wardrobe.buy('glider-night'));
const panel = await ada.page.evaluate(middlePanel);
check('the Starry Glider is bought, and the glider takes its canopy', (await ada.page.evaluate(() => window.__wb.ctx.wardrobe.worn.glider === 'glider-night')) && panel.filter(([r, , b]) => r > 180 && b < 140).length >= 2, panel);
check('others would see all three', (await ada.page.evaluate(() => window.__wb.ctx.wardrobe.looks)) === 'hood-plum glider-night', await ada.page.evaluate(() => window.__wb.ctx.wardrobe.looks));
// the Wardrobe tab: a tile per look, and no more words than the one note
const tab = await ada.page.evaluate(() => {
  const section = document.querySelector('.wb-card section[data-tab="wardrobe"]');
  return {
    tabs: [...section.querySelectorAll('.wd-tabs button')].map((b) => b.textContent),
    tiles: section.querySelectorAll('.wd-tile').length,
    looks: window.__wb.ctx.wardrobe.items.length,
    lead: !!section.querySelector('.cd-lead'),
    note: section.querySelector('.cd-note').textContent,
  };
});
check('the Wardrobe tab: Scarves, Hoods and Gliders, a tile per look, just the one note', JSON.stringify(tab.tabs) === '["Scarves","Hoods","Gliders"]' && tab.tiles === tab.looks && tab.looks === 24 && !tab.lead && tab.note === 'What you own is yours on every device you sign in on.', tab);

// everyone else is a hero: what Ben sees of Ada (and Ada of Ben)
const seen = () => {
  const visitors = window.__wb.ctx.multiplayer.visitors;
  return [...(visitors?.heroes.values() ?? [])].map((h) => {
    const s = h.double.state;
    const c = h.double.scarf.colAttr.array;
    return {
      name: h.v.name,
      drawn: h.double.group.visible && !!h.double.group.parent && h.double.hero.mesh.isSkinnedMesh,
      at: [s.position.x, s.position.z].map((n) => +n.toFixed(2)),
      mode: s.mode,
      jumpedAt: s.lastJumpTime,
      flickedAt: s.lastFlickTime,
      looks: h.v.looks,
      scarf: [c[0], c[1], c[2]].map((x) => +x.toFixed(3)),
      hood: h.double.hero.mats.hood.base.value.getHexString(),
    };
  });
};
const seenBy = (page) => page.evaluate(seen);
const hero = (page, name) => page.evaluate((n) => (window.__wb.ctx.multiplayer.visitors?.heroes ? [...window.__wb.ctx.multiplayer.visitors.heroes.values()].some((h) => h.v.name === n) : false), name);
check('Ben sees Ada as a hero (not a blob)', await waitFor(ben.page, () => [...(window.__wb.ctx.multiplayer.visitors?.heroes.values() ?? [])].some((h) => h.v.name === 'Ada' && h.double.group.visible)), await seenBy(ben.page));
check('…and Ada sees Ben as one', await hero(ada.page, 'Ben'), await seenBy(ada.page));
// Ada stands a few metres in front of Ben's camera, facing it
const spot = await ben.page.evaluate(() => {
  const { ctx } = window.__wb;
  const dir = ctx.camera.getWorldDirection(ctx.player.state.position.clone());
  const p = ctx.player.state.position;
  const len = Math.hypot(dir.x, dir.z) || 1;
  const [fx, fz] = [dir.x / len, dir.z / len];
  const x = p.x + fx * 3.2 + fz * 1.1;
  const z = p.z + fz * 3.2 - fx * 1.1;
  return { x, z, y: ctx.terrain.heightAt(x, z), facing: Math.atan2(ctx.camera.position.x - x, ctx.camera.position.z - z) };
});
await ada.page.evaluate((s) => window.__wb.ctx.player.teleport(window.__wb.ctx.player.state.position.clone().set(s.x, s.y, s.z), s.facing), spot);
const near = (s) => [...window.__wb.ctx.multiplayer.visitors.heroes.values()].some((h) => h.v.name === 'Ada' && Math.hypot(h.double.state.position.x - s.x, h.double.state.position.z - s.z) < 0.6);
check('Ada’s hero is where Ada is', await waitFor(ben.page, near, spot, 30000), { spot, seen: await seenBy(ben.page) });
await ada.page.evaluate(() => window.__wb.ctx.wardrobe.wear('scarf-frost'));
const blue = () => [...window.__wb.ctx.multiplayer.visitors.heroes.values()].some((h) => {
  const c = h.double.scarf.colAttr.array;
  const wrap = h.double.hero.mats.scarf.base.value;
  return h.v.name === 'Ada' && (h.v.looks ?? '').split(' ').includes('scarf-frost') && c[2] > c[0] + 0.2 && wrap.b > wrap.r + 0.2;
});
check('Ada puts the Frost Scarf back on, and Ben sees it on her hero', await waitFor(ben.page, blue, null, 30000), await seenBy(ben.page));
check('…in her Plum Hood too, with the Starry Glider for when she glides', await ben.page.evaluate(async () => {
  const { CANOPIES } = await import('/src/character/glider.js');
  return [...window.__wb.ctx.multiplayer.visitors.heroes.values()].some((h) => h.v.name === 'Ada' && h.double.hero.mats.hood.base.value.getHexString() === '5f3b80' && h.double.canopy === CANOPIES.night);
}), await seenBy(ben.page));
if (shotPath) {
  await ben.page.waitForTimeout(1500);
  await ben.page.screenshot({ path: shotPath });
  console.log(`  (Ben’s view → ${shotPath})`);
}
// what Ada's hero does in Ben's world, frame by frame
await ben.page.evaluate(() => {
  window.__ada = { modes: new Set(), air: 0 };
  const watch = () => {
    for (const h of window.__wb.ctx.multiplayer.visitors.heroes.values())
      if (h.v.name === 'Ada') {
        window.__ada.modes.add(h.double.state.mode);
        window.__ada.air = Math.max(window.__ada.air, h.double.anim.weights.air);
      }
    requestAnimationFrame(watch);
  };
  watch();
});
await ada.page.evaluate(() => window.__wb.tap('Space'));
const jumped = () => window.__ada.modes.has('air') && window.__ada.air > 0.5 && [...window.__wb.ctx.multiplayer.visitors.heroes.values()].some((h) => h.v.name === 'Ada' && h.double.state.lastJumpTime >= 0);
check('Ada jumps, and her hero jumps for Ben', await waitFor(ben.page, jumped, null, 30000), { seen: await seenBy(ben.page), ada: await ben.page.evaluate(() => ({ modes: [...window.__ada.modes], air: window.__ada.air })) });
await ada.page.waitForTimeout(1500);
check('Ada throws again', await ada.page.evaluate(THROW, 'yellow'));
check('…and her hero flicks its brush for Ben', await waitFor(ben.page, () => [...window.__wb.ctx.multiplayer.visitors.heroes.values()].some((h) => h.v.name === 'Ada' && h.double.state.lastFlickTime >= 0), null, 30000), await seenBy(ben.page));
await ben.page.evaluate(() => window.__wb.tap('Escape'));
check('Ben opens the pause menu', await waitFor(ben.page, () => window.__wb.ctx.time.scale === 0, null, 10000));
const from = (await seenBy(ben.page)).find((h) => h.name === 'Ada')?.at;
const clocks = () => ({ game: window.__wb.ctx.time.elapsed, ada: [...window.__wb.ctx.multiplayer.visitors.heroes.values()].find((h) => h.v.name === 'Ada')?.double.clock.elapsed });
const clocksBefore = await ben.page.evaluate(clocks);
// held until she has walked a few metres: at a few frames a second, game time crawls here
const adaFrom = await ada.page.evaluate(() => window.__wb.ctx.player.state.position.toArray());
await ada.page.evaluate(() => window.__wb.ctx.input.inject('KeyW', true));
const walked = await waitFor(ada.page, (f) => Math.hypot(window.__wb.ctx.player.state.position.x - f[0], window.__wb.ctx.player.state.position.z - f[2]) > 3, adaFrom, 120000);
await ada.page.evaluate(() => window.__wb.ctx.input.inject('KeyW', false));
check('Ada walks a few metres', walked, { adaFrom, now: await ada.page.evaluate(() => window.__wb.ctx.player.state.position.toArray()) });
const moved = (f) => [...window.__wb.ctx.multiplayer.visitors.heroes.values()].some((h) => h.v.name === 'Ada' && Math.hypot(h.double.state.position.x - f[0], h.double.state.position.z - f[1]) > 1.5);
check('…and Ada’s hero walks on while he’s paused', !!from && (await waitFor(ben.page, moved, from, 30000)), { from, seen: await seenBy(ben.page) });
const clocksAfter = await ben.page.evaluate(clocks);
check('…on its own clock: Ben’s game time stood still', clocksAfter.game === clocksBefore.game && clocksAfter.ada - clocksBefore.ada > 1, { clocksBefore, clocksAfter });
const doubleOfAda = await ben.page.evaluateHandle(() => [...window.__wb.ctx.multiplayer.visitors.heroes.values()].find((h) => h.v.name === 'Ada')?.double);
// Orb sees her go (presence); a page being closed here can't be relied on to say so itself
await ada.page.evaluate(() => window.__orbTest.leave());
await ada.page.close();
check('Ada leaves, and her hero goes with her', await waitFor(ben.page, () => !window.__wb.ctx.multiplayer.visitors.heroes.size, null, 30000), await seenBy(ben.page));
check('…its meshes are out of Ben’s scene', await ben.page.evaluate((d) => !!d && !d.group.parent, doubleOfAda));
check('nothing threw', !ada.errors.length && !ben.errors.length, { ada: ada.errors, ben: ben.errors });

await browser.close();
console.log(failures.length ? `\n${failures.length} failed` : '\nall passed');
process.exit(failures.length ? 1 : 0);
