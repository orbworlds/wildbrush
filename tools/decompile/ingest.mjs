#!/usr/bin/env node
// Merges reviewers' rename maps and file groupings into the plan. A review file is
//   { "file": "enemies/index.js",               // the reviewed file in the pass the review saw
//     "names": { "120:e": "enemy", … },          // line:currentName → new name
//     "files": [ { "path": "enemies/ai.js", "unit": 0, "header": "…" }, … ] }
// Lines refer to the review's pass (its .decompile/bindings index); units to its units.json.
//
//   node ingest.mjs <passDir> <plan.json> review.json…
import fs from 'node:fs';
import path from 'node:path';
import { isValidName } from './names.mjs';
import { APP_CHUNKS, WORKERS } from './config.mjs';

const [passDir, planFile, ...reviews] = process.argv.slice(2);
const plan = fs.existsSync(planFile) ? JSON.parse(fs.readFileSync(planFile, 'utf8')) : { names: {}, files: {}, headers: {} };
plan.names ??= {};
plan.files ??= {};
plan.headers ??= {};
const units = JSON.parse(fs.readFileSync(path.join(passDir, '.decompile/units.json'), 'utf8'));
let named = 0, skipped = 0, filesSet = 0;
const problems = [];
for (const rf of reviews) {
  const r = JSON.parse(fs.readFileSync(rf, 'utf8'));
  const idxFile = path.join(passDir, '.decompile/bindings', r.file + '.json');
  if (!fs.existsSync(idxFile)) {
    problems.push(`${rf}: no binding index for ${r.file}`);
    continue;
  }
  const index = JSON.parse(fs.readFileSync(idxFile, 'utf8'));
  for (const [key, name] of Object.entries(r.names ?? {})) {
    const k = key.trim();
    const id = index[k] ?? index[k.replace(/\s+/g, '')];
    if (!id) {
      skipped++;
      if (problems.length < 400) problems.push(`${r.file}: ${k} is not a declaration in that pass`);
      continue;
    }
    if (!isValidName(name)) {
      skipped++;
      problems.push(`${r.file}: ${k} → "${name}" is not a usable name`);
      continue;
    }
    plan.names[id] = name;
    named++;
  }
  const worker = WORKERS.find((w) => w.path === r.file);
  if (worker) {
    const h = r.header ?? r.files?.[0]?.header;
    if (h) plan.headers[worker.file] = h;
    continue;
  }
  if (r.files?.length) {
    // which chunk the reviewed file belongs to
    const chunkFile = Object.keys(units).find((c) => {
      const ch = APP_CHUNKS.find((x) => x.file === c);
      return ch && r.chunk === ch.name;
    }) ?? APP_CHUNKS.find((c) => c.name === r.chunk)?.file;
    if (!chunkFile) {
      problems.push(`${rf}: say which chunk ("chunk": name) the files belong to`);
      continue;
    }
    const list = units[chunkFile];
    const entries = r.files.map((f) => {
      const u = list[f.unit];
      if (!u) throw new Error(`${rf}: unit ${f.unit} does not exist in ${chunkFile}`);
      return { path: f.path.replace(/^\.?\/?(src\/)?/, ''), at: u.at, header: f.header };
    });
    const prev = (plan.files[chunkFile] ?? []).filter((e) => !entries.some((x) => x.at === e.at));
    plan.files[chunkFile] = [...prev, ...entries].sort((a, b) => list.findIndex((u) => u.at === a.at) - list.findIndex((u) => u.at === b.at));
    filesSet += entries.length;
  }
  if (r.header && r.workerFile) plan.headers[r.workerFile] = r.header;
  if (r.header && r.styleFile) plan.headers[r.styleFile] = r.header;
}
fs.writeFileSync(planFile, JSON.stringify(plan, null, 1));
console.log(`plan: +${named} names (${skipped} skipped), ${filesSet} file starts`);
if (problems.length) console.log(problems.slice(0, 60).join('\n'));
