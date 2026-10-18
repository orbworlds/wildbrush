#!/usr/bin/env node
// Mirrors the live Wildbrush build (index.html and every asset it reaches: chunks, the worker,
// the stylesheet, fonts) into .original/, the input of the decompiler.
//
//   node tools/decompile/fetch.mjs [origin=https://wildbrush.vercel.app]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ORIGIN } from './config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const origin = process.argv[2] ?? ORIGIN;
const dest = path.join(root, '.original');
fs.mkdirSync(path.join(dest, 'assets'), { recursive: true });

async function get(rel) {
  const res = await fetch(new URL(rel, origin));
  if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const html = (await get('/')).toString('utf8');
fs.writeFileSync(path.join(dest, 'index.html'), html);
const seen = new Set();
const queue = [...html.matchAll(/\/?(assets\/[\w.-]+)/g)].map((m) => m[1]);
while (queue.length) {
  const rel = queue.shift();
  if (seen.has(rel)) continue;
  seen.add(rel);
  const body = await get(`/${rel}`);
  fs.writeFileSync(path.join(dest, rel), body);
  if (/\.(js|css)$/.test(rel)) {
    for (const m of body.toString('utf8').matchAll(/(assets\/[\w.-]+\.(?:js|css|wasm|woff2?|png|jpg|webp|json))/g)) queue.push(m[1]);
  }
}
console.log(`fetched index.html and ${seen.size} assets from ${origin} → ${path.relative(process.cwd(), dest)}`);
