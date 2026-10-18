#!/usr/bin/env node
// Identifies the library code bundled into the build and writes the name maps run.mjs uses:
// every top-level declaration of a chunk is aligned (in order, by a fingerprint of the property
// names, strings, numbers and globals it uses, which survive minification) with the declarations
// of the real library build from node_modules. Also checks the embedded Rapier WASM byte for byte
// and prints, per chunk, the runs of items each library matched — the evidence behind the byte
// ranges in config.mjs.
//
//   node tools/decompile/identify.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { topItems, makeSimilarity, align, parseModule } from './fingerprint.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const world = path.resolve(here, '../..');
const assets = path.join(world, '.original/assets');
const nm = (p) => path.join(world, 'node_modules', p);
const read = (f) => fs.readFileSync(f, 'utf8');
const maps = path.join(here, 'maps');
fs.mkdirSync(maps, { recursive: true });

function alignFile(minSrc, refSrc) {
  const A = topItems(minSrc);
  const B = topItems(refSrc);
  const sim = makeSimilarity([...A, ...B]);
  const map = {};
  for (const [i, j, s] of align(A, B, sim, 0.2)) if (A[i].name && B[j].name) map[A[i].name] = { name: B[j].name, sim: +s.toFixed(3), at: A[i].start, end: A[i].end };
  return { A, map };
}

function exportsOf(src) {
  const out = {};
  for (const st of parseModule(src).program.body) {
    if (st.type === 'ExportNamedDeclaration' && !st.declaration) for (const s of st.specifiers) out[s.exported.name ?? s.exported.value] = s.local.name;
  }
  return out;
}

function runs(label, A, libs) {
  console.log(`\n${label}`);
  const best = (it) => {
    let b = null;
    for (const [lib, map] of Object.entries(libs)) {
      const m = it.name && map[it.name];
      if (m && m.sim >= 0.35 && (!b || m.sim > b.sim)) b = { lib, ...m };
    }
    return b?.lib ?? '-';
  };
  let start = 0;
  for (let i = 1; i <= A.length; i++) {
    if (i === A.length || best(A[i]) !== best(A[start])) {
      console.log(`  ${best(A[start]).padEnd(16)} @${A[start].start}–${A[i - 1].end}  (${i - start} items, from ${A[start].name ?? 'statement'})`);
      start = i;
    }
  }
}

const chunk = (prefix) => {
  const f = fs.readdirSync(assets).find((x) => x.startsWith(prefix + '-') && x.endsWith('.js'));
  if (!f) throw new Error(`no ${prefix} chunk in .original/assets (run fetch.mjs)`);
  return read(path.join(assets, f));
};

// three.core: exported names
{
  const src = chunk('three.core');
  const { map } = alignFile(src, read(nm('three/build/three.core.js')));
  const exported = {};
  for (const [exp, local] of Object.entries(exportsOf(src))) exported[exp] = { local, name: map[local]?.name ?? null, sim: map[local]?.sim ?? 0 };
  fs.writeFileSync(path.join(maps, 'map-three-core.json'), JSON.stringify({ exported }, null, 1));
  const unnamed = Object.entries(exported).filter(([, v]) => !v.name);
  console.log(`three.core: ${Object.keys(exported).length} exports, ${unnamed.length} without a match (named in config.mjs): ${unnamed.map(([k, v]) => `${k}=${v.local}`).join(' ')}`);
}
// BufferGeometryUtils
{
  const src = chunk('BufferGeometryUtils');
  const { map } = alignFile(src, read(nm('three/examples/jsm/utils/BufferGeometryUtils.js')));
  const exported = {};
  for (const [exp, local] of Object.entries(exportsOf(src))) exported[exp] = { local, name: map[local]?.name ?? null, sim: map[local]?.sim ?? 0 };
  fs.writeFileSync(path.join(maps, 'map-bgu.json'), JSON.stringify({ exported }, null, 1));
}
// the entry chunk: three.module, Rapier, lil-gui, OrbitControls, simplex-noise
{
  const src = chunk('index');
  const libs = {};
  let A;
  for (const [lib, ref] of Object.entries({
    'three.module': 'three/build/three.module.js',
    rapier: '@dimforge/rapier3d-compat/dist/rapier.mjs',
    'lil-gui': 'lil-gui/dist/lil-gui.esm.js',
    orbit: 'three/examples/jsm/controls/OrbitControls.js',
    simplex: 'simplex-noise/dist/esm/simplex-noise.js',
  })) {
    const r = alignFile(src, read(nm(ref)));
    libs[lib] = r.map;
    A = r.A;
  }
  const slim = Object.fromEntries(Object.entries(libs['three.module']).map(([k, v]) => [k, { name: v.name }]));
  fs.writeFileSync(path.join(maps, 'map-index-three.module.json'), JSON.stringify({ map: slim }, null, 1));
  runs('index chunk (entry):', A, libs);
  // the WASM Rapier inlines as base64 must be the package's own
  const b64 = src.match(/[`"]([A-Za-z0-9+/=]{100000,})[`"]/)?.[1];
  const wasm = b64 && Buffer.from(b64, 'base64');
  const ref = fs.readFileSync(nm('@dimforge/rapier3d-compat/dist/rapier_wasm3d_bg.wasm'));
  console.log(`  embedded Rapier WASM: ${wasm ? `${wasm.length} bytes, ${wasm.equals(ref) ? 'identical to' : 'DIFFERENT from'} @dimforge/rapier3d-compat's` : 'not found'}`);
}
// the render chunk: postprocessing and N8AO
{
  const src = chunk('render');
  const pp = alignFile(src, read(nm('postprocessing/build/index.js')));
  const n8aoSrc = read(nm('n8ao/dist/N8AO.js'));
  const n8 = alignFile(src, n8aoSrc);
  const ppExports = new Set([...read(nm('postprocessing/build/index.js')).matchAll(/export \{([^}]*)\}/g)].flatMap((m) => m[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop())));
  const n8Exports = Object.fromEntries(Object.entries(exportsOf(n8aoSrc)).map(([exp, local]) => [local, exp]));
  fs.writeFileSync(path.join(maps, 'names-render-pp.json'), JSON.stringify(Object.fromEntries(Object.entries(pp.map).filter(([, v]) => ppExports.has(v.name)).map(([k, v]) => [k, v.name]))));
  fs.writeFileSync(path.join(maps, 'names-render-n8ao.json'), JSON.stringify(Object.fromEntries(Object.entries(n8.map).filter(([, v]) => n8Exports[v.name]).map(([k, v]) => [k, n8Exports[v.name]]))));
  runs('render chunk:', pp.A, { postprocessing: pp.map, n8ao: n8.map });
}
// the elements chunk: RoundedBoxGeometry
{
  const src = chunk('elements');
  const r = alignFile(src, read(nm('three/examples/jsm/geometries/RoundedBoxGeometry.js')));
  fs.writeFileSync(path.join(maps, 'names-elements-rbg.json'), JSON.stringify(Object.fromEntries(Object.entries(r.map).filter(([, v]) => v.name === 'RoundedBoxGeometry').map(([k, v]) => [k, v.name]))));
  runs('elements chunk:', r.A, { 'rounded-box': r.map });
}
console.log(`\nwrote ${path.relative(process.cwd(), maps)}/`);
