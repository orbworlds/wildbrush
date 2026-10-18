#!/usr/bin/env node
// Plays the original build and the decompiled one under identical, deterministic conditions and
// compares what they draw and do, frame by frame: Math.random is seeded (three.js's UUIDs get
// their own stream, as the CDN build creates more objects than the tree-shaken bundle did), the
// clock, requestAnimationFrame and (after boot) timers are virtual, and a script of inputs is
// replayed. At each checkpoint the WebGL frame is read back in the task that drew it and the
// player's state is recorded. Exits 1 when anything differs.
//
//   node tools/decompile/compare.mjs <originalUrl> <decompiledUrl> [--frames=200] [--w=640 --h=360] [--out=.decompile/compare] [--query=…]
//
// Serve both first, e.g. `node tools/serve.mjs 8001:.original 8002:.` (software WebGL boots each
// in about a minute and draws a few frames a second).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { launch } from '../../../../scripts/pw.mjs';

const world = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const [origUrl, newUrl] = args.filter((a) => !a.startsWith('--'));
if (!origUrl || !newUrl) throw new Error('usage: compare.mjs <originalUrl> <decompiledUrl> [--frames=N]');
const W = Number(opt.w ?? 640), H = Number(opt.h ?? 360);
const FRAMES = Number(opt.frames ?? 200);
const outDir = path.resolve(opt.out ?? path.join(world, '.decompile/compare'));
fs.mkdirSync(outDir, { recursive: true });

const INIT = `(() => {
  const stream = (seed) => () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const game = stream(0x9e3779b9), uuid = stream(0x51ed270b);
  const uuidCaller = new RegExp('(generateUUID|[^A-Za-z0-9_$]pt) [(][^)]*three');
  const caller = () => {
    const limit = Error.stackTraceLimit;
    Error.stackTraceLimit = 3;
    const s = new Error().stack;
    Error.stackTraceLimit = limit;
    return s;
  };
  Math.random = () => (uuidCaller.test(caller()) ? uuid() : game());
  let now = 1000;
  performance.now = () => now;
  Date.now = () => 1767225600000 + now;
  let raf = [], rafId = 0;
  window.requestAnimationFrame = (cb) => { raf.push([++rafId, cb]); return rafId; };
  window.cancelAnimationFrame = (id) => { raf = raf.filter(([i]) => i !== id); };
  const realSetTimeout = window.setTimeout.bind(window), realClearTimeout = window.clearTimeout.bind(window);
  let virtual = false, timers = [], timerId = 1e6;
  window.setTimeout = (fn, ms = 0, ...a) => {
    if (!virtual) return realSetTimeout(fn, ms, ...a);
    const id = ++timerId; timers.push({ id, at: now + Math.max(0, ms || 0), fn, a }); return id;
  };
  window.clearTimeout = (id) => { if (id > 1e6) timers = timers.filter((x) => x.id !== id); else realClearTimeout(id); };
  // idle callbacks run at the next frame (the UI prepares its pause menu, drawing random strokes, in one)
  const realIdle = window.requestIdleCallback?.bind(window);
  window.requestIdleCallback = (fn, opts) => {
    if (!virtual) return realIdle ? realIdle(fn, opts) : realSetTimeout(fn, 1);
    return window.setTimeout(() => fn({ didTimeout: false, timeRemaining: () => 50 }), 1);
  };
  window.__virtualTimers = () => { virtual = true; };
  window.__step = (dt = 1000 / 60) => {
    now += dt;
    const due = timers.filter((x) => x.at <= now).sort((a, b) => a.at - b.at || a.id - b.id);
    timers = timers.filter((x) => x.at > now);
    for (const x of due) { try { if (typeof x.fn === 'function') x.fn(...x.a); } catch (e) { console.error('timer threw', e); } }
    const q = raf; raf = [];
    for (const [, cb] of q) { try { cb(now); } catch (e) { console.error('raf threw', e && e.stack || e); } }
  };
  window.__pixels = () => {
    const gl = window.__wb.ctx.renderer.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let bin = ''; for (let i = 0; i < px.length; i += 0x8000) bin += String.fromCharCode.apply(null, px.subarray(i, i + 0x8000));
    return { w, h, b64: btoa(bin) };
  };
})();`;

// what happens when: the title screen is clicked away, then walk, jump, strafe and swing
const SCRIPT = [
  { at: 20, check: true },
  { at: 25, click: '.wb-title' },
  { at: 40, key: 'KeyW', down: true },
  { at: 100, key: 'KeyW', down: false, check: true },
  { at: 105, key: 'Space', down: true },
  { at: 110, key: 'Space', down: false },
  { at: 130, key: 'KeyD', down: true },
  { at: 160, key: 'KeyD', down: false },
  { at: 170, key: 'Mouse0', down: true },
  { at: 176, key: 'Mouse0', down: false, check: true },
];

const browser = await launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });

async function run(label, url) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', (r) => logs.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
  await page.addInitScript(INIT);
  const t0 = Date.now();
  await page.goto(url + (opt.query ? `?${opt.query}` : ''), { waitUntil: 'load' });
  await page.waitForFunction(() => window.__wb && window.__wb.bootTimes, null, { timeout: 300000, polling: 250 });
  const bootMs = Date.now() - t0;
  await page.evaluate(() => window.__virtualTimers());
  const checks = [];
  for (let f = 1; f <= FRAMES; f++) {
    for (const s of SCRIPT.filter((x) => x.at === f && x.key)) await page.evaluate(([k, d]) => window.__wb.ctx.input.inject(k, d), [s.key, s.down]);
    for (const s of SCRIPT.filter((x) => x.at === f && x.click)) await page.evaluate((sel) => document.querySelector(sel)?.click(), s.click);
    const check = SCRIPT.some((x) => x.at === f && x.check) || f === FRAMES;
    // read the frame in the task that drew it (the drawing buffer is cleared once composited)
    const px = await page.evaluate((c) => {
      window.__step();
      return c ? window.__pixels() : null;
    }, check);
    if (!check) continue;
    const state = await page.evaluate(() => {
      const p = window.__wb.ctx.player?.state;
      const r = (v) => (v && v.toArray ? v.toArray().map((x) => +x.toFixed(4)) : v);
      return p ? { pos: r(p.position), vel: r(p.velocity), facing: +p.facing.toFixed(4), mode: p.mode, health: p.health, grounded: p.grounded, stamina: +p.stamina.toFixed(4), cam: r(window.__wb.ctx.camera.position) } : null;
    });
    const raw = Buffer.from(px.b64, 'base64');
    fs.writeFileSync(path.join(outDir, `${label}-f${f}.png`), png(raw, px.w, px.h));
    checks.push({ frame: f, raw, state });
  }
  const info = await page.evaluate(() => ({ services: window.__wb.services, errors: window.__wb.errors }));
  await ctx.close();
  return { bootMs, checks, info, logs };
}

const a = await run('original', origUrl);
const b = await run('decompiled', newUrl);
await browser.close();

let same = JSON.stringify(a.info) === JSON.stringify(b.info);
const report = { boot: { original: a.bootMs, decompiled: b.bootMs }, services: b.info.services, errors: { original: a.info.errors, decompiled: b.info.errors }, checks: [] };
for (let i = 0; i < a.checks.length; i++) {
  const x = a.checks[i], y = b.checks[i];
  let differing = 0;
  const diff = Buffer.alloc(x.raw.length);
  for (let k = 0; k < x.raw.length; k += 4) {
    const d = x.raw[k] !== y.raw[k] || x.raw[k + 1] !== y.raw[k + 1] || x.raw[k + 2] !== y.raw[k + 2] || x.raw[k + 3] !== y.raw[k + 3];
    const g = (x.raw[k] + x.raw[k + 1] + x.raw[k + 2]) / 9;
    if (d) differing++;
    diff[k] = d ? 255 : g; diff[k + 1] = d ? 0 : g; diff[k + 2] = d ? 0 : g; diff[k + 3] = 255;
  }
  if (differing) fs.writeFileSync(path.join(outDir, `diff-f${x.frame}.png`), png(diff, W, H));
  const stateSame = JSON.stringify(x.state) === JSON.stringify(y.state);
  if (differing || !stateSame) same = false;
  report.checks.push({ frame: x.frame, differingPixels: differing, of: x.raw.length / 4, stateSame, state: x.state, ...(stateSame ? {} : { decompiledState: y.state }) });
}
report.same = same;
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify({ ...report, logs: { original: a.logs, decompiled: b.logs } }, null, 1));
console.log(JSON.stringify(report, null, 1));
process.exit(same ? 0 : 1);

/** RGBA rows bottom-up (as gl.readPixels returns them) → PNG. */
function png(px, w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) px.copy(raw, y * (w * 4 + 1) + 1, (h - 1 - y) * w * 4, (h - y) * w * 4);
  const table = new Int32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c;
  });
  const crc = (buf) => {
    let c = -1;
    for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
