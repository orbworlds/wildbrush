#!/usr/bin/env node
// Decompiles the live Wildbrush build into readable ES modules.
//
//   node tools/decompile/run.mjs [outDir=.decompile/out] [plan.json=tools/decompile/plan.json] [assetsDir=.original/assets]
//
// outDir receives index.html, src/ and the review aids (.decompile/: units per chunk and the
// binding index that reviewed renames are given against). Library code becomes imports, the
// syntax is un-minified, identifiers get the plan's names (else heuristic ones) through a
// scope-aware renamer that verifies every reference, and each chunk is cut into the plan's files.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as t from '@babel/types';
import prettier from 'prettier';
import { parse, traverse, generate } from './babel.mjs';
import { unminify, constify, declarationsFromExpressions, restoreNumbers } from './unminify.mjs';
import { collect, plan as planNames, apply as applyNames, shorthand, suggest, isValidName } from './names.mjs';
import { segment, stmtKey, topIndex, relPath } from './link.mjs';
import { APP_CHUNKS, LIB_CHUNKS, LIB_RANGES, PRELOAD_HELPER, DEFAULT_IMPORT_NAMES, WORKERS, STYLES, FONT_URLS, IMPORT_MAP } from './config.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const world = path.resolve(here, '../..');
const [outDir = path.join(world, '.decompile/out'), planFile = path.join(here, 'plan.json'), assetsDir = path.join(world, '.original/assets')] = process.argv.slice(2);
if (path.resolve(outDir) === world) throw new Error('refusing to overwrite the world itself: give another outDir');
const PLAN = planFile && fs.existsSync(planFile) ? JSON.parse(fs.readFileSync(planFile, 'utf8')) : { names: {}, files: {} };
PLAN.names ??= {};
PLAN.files ??= {};
PLAN.headers ??= {};
const maps = path.join(here, 'maps');
const readJSON = (f) => JSON.parse(fs.readFileSync(path.join(maps, f), 'utf8'));

// ---- library export names -----------------------------------------------------------------
const libExport = {}; // chunk file → mangled export → { source, name }
for (const [file, cfg] of Object.entries(LIB_CHUNKS)) {
  const m = readJSON(cfg.map);
  libExport[file] = {};
  for (const [exp, v] of Object.entries(m.exported)) {
    const name = cfg.overrides?.[exp] ?? v.name;
    if (!name) throw new Error(`${file}: export ${exp} has no library name`);
    libExport[file][exp] = { source: cfg.source, name };
  }
}
const threeModuleMap = readJSON('map-index-three.module.json').map;
const mainFile = APP_CHUNKS.find((c) => c.main).file;
// what the entry chunk re-exports from three.module (other chunks import these from it)
const mainLibExports = {};

const chunkByFile = Object.fromEntries(APP_CHUNKS.map((c) => [c.file, c]));
const state = {}; // chunk file → { ast, collected, exportsByName, imports: Map(rec → {chunk, export}|{source,name}), ... }

function srcFile(source) {
  return path.basename(source);
}

// ---- per-chunk processing -----------------------------------------------------------------
for (const chunk of APP_CHUNKS) {
  const code = fs.readFileSync(path.join(assetsDir, chunk.file), 'utf8');
  const ast = parse(code);
  const st = (state[chunk.file] = { chunk, ast, exportsByName: {}, appImports: new Map(), dynamic: [] });
  const body = ast.program.body;

  // 1. the chunk's own export list (removed; exports are generated per file)
  const exportList = {};
  for (let i = body.length - 1; i >= 0; i--) {
    const s = body[i];
    if (t.isExportNamedDeclaration(s) && !s.declaration && !s.source) {
      for (const sp of s.specifiers) exportList[sp.exported.name ?? sp.exported.value] = sp.local.name;
      body.splice(i, 1);
    }
  }

  // 2. library code inside the chunk: drop it, remember how the game reaches into it
  const libLocals = {}; // local → range
  const ranges = LIB_RANGES[chunk.file];
  if (ranges) {
    const inRange = (node) => ranges.find((r) => node.start >= r.from && node.end <= r.to);
    for (let i = body.length - 1; i >= 0; i--) {
      const s = body[i];
      if (t.isVariableDeclaration(s)) {
        s.declarations = s.declarations.filter((d) => {
          const r = inRange(d);
          if (r && t.isIdentifier(d.id)) libLocals[d.id.name] = r;
          return !r;
        });
        if (!s.declarations.length) body.splice(i, 1);
      } else if (!t.isImportDeclaration(s)) {
        const r = inRange(s);
        if (r) {
          if (s.id?.name) libLocals[s.id.name] = r;
          body.splice(i, 1);
        }
      }
    }
    for (const [exp, local] of Object.entries(exportList)) {
      const r = libLocals[local];
      if (exp === PRELOAD_HELPER.export && local === PRELOAD_HELPER.local) {
        delete exportList[exp];
        continue;
      }
      if (r) {
        if (!chunk.main || r.lib !== 'three') throw new Error(`${chunk.file} re-exports ${local} from ${r.lib}`);
        const name = threeModuleMap[local]?.name;
        if (!name) throw new Error(`entry re-export ${exp}=${local}: unknown three.module name`);
        mainLibExports[exp] = { source: 'three', name };
        delete exportList[exp];
      }
    }
  }
  st.exportList = exportList;

  // 3. imports: library chunks → bare specifiers with real names; app chunks → recorded
  const preloadLocals = new Set(chunk.main ? [PRELOAD_HELPER.local] : []);
  for (const s of body) {
    if (!t.isImportDeclaration(s)) continue;
    const from = srcFile(s.source.value);
    if (libExport[from]) {
      const lib = libExport[from];
      for (const sp of s.specifiers) {
        const v = lib[sp.imported.name];
        if (!v) throw new Error(`${chunk.file}: ${from} has no export ${sp.imported.name}`);
        sp.imported = t.identifier(v.name);
      }
      s.source = t.stringLiteral(Object.values(lib)[0].source);
    } else if (from === mainFile) {
      const keep = [];
      const three = [];
      for (const sp of s.specifiers) {
        const exp = sp.imported.name;
        if (exp === PRELOAD_HELPER.export) preloadLocals.add(sp.local.name);
        else if (mainLibExports[exp]) three.push(t.importSpecifier(sp.local, t.identifier(mainLibExports[exp].name)));
        else keep.push(sp);
      }
      s.specifiers = keep;
      if (three.length) st.extraImports = (st.extraImports ?? []).concat(t.importDeclaration(three, t.stringLiteral('three')));
    } else if (!chunkByFile[from]) {
      throw new Error(`${chunk.file}: import from unknown chunk ${from}`);
    }
  }
  if (st.extraImports) body.unshift(...st.extraImports);
  for (let i = body.length - 1; i >= 0; i--) if (t.isImportDeclaration(body[i]) && !body[i].specifiers.length) body.splice(i, 1);

  // 4. Vite plumbing: __vite__mapDeps, preload wrappers around dynamic imports, worker URLs
  for (let i = body.length - 1; i >= 0; i--) {
    const s = body[i];
    if (t.isVariableDeclaration(s) && s.declarations.some((d) => d.id.name === '__vite__mapDeps')) {
      s.declarations = s.declarations.filter((d) => d.id.name !== '__vite__mapDeps');
      if (!s.declarations.length) body.splice(i, 1);
    }
  }
  traverse(ast, {
    CallExpression(p) {
      const c = p.node.callee;
      if (t.isIdentifier(c) && preloadLocals.has(c.name) && t.isArrowFunctionExpression(p.node.arguments[0])) {
        // __vitePreload(() => import('./x.js')…, deps) → import('./x.js')…
        const expr = p.node.arguments[0].body;
        let hasImport = false;
        t.traverseFast(expr, (n) => {
          if (t.isCallExpression(n) && t.isImport(n.callee)) hasImport = true;
        });
        if (!hasImport || t.isBlockStatement(expr)) throw new Error(`${chunk.file}: unexpected preload call`);
        p.replaceWith(expr);
        return;
      }
      if (t.isImport(c) && t.isStringLiteral(p.node.arguments[0]) || (t.isImport(c) && t.isTemplateLiteral(p.node.arguments[0]))) {
        const a = p.node.arguments[0];
        const spec = t.isStringLiteral(a) ? a.value : a.quasis[0].value.cooked;
        const target = srcFile(spec);
        if (!chunkByFile[target]) throw new Error(`${chunk.file}: dynamic import of unknown chunk ${spec}`);
        const lit = t.stringLiteral(spec);
        lit.__dcChunk = target;
        p.node.arguments[0] = lit;
      }
    },
    NewExpression(p) {
      const c = p.node.callee;
      if (!t.isIdentifier(c, { name: 'URL' })) return;
      const [a, b] = p.node.arguments;
      const spec = t.isStringLiteral(a) ? a.value : t.isTemplateLiteral(a) && !a.expressions.length ? a.quasis[0].value.cooked : null;
      const w = WORKERS.find((x) => x.url === spec);
      if (!w) return;
      const lit = t.stringLiteral(spec);
      lit.__dcAsset = w.path;
      p.node.arguments[0] = lit;
      if (t.isBinaryExpression(b, { operator: '+' })) p.node.arguments[1] = b.right; // `` + import.meta.url
    },
  });

  // 5. references into the dropped library code → imports
  if (ranges) {
    const needed = new Map(); // local → { source, name }
    traverse(ast, {
      Identifier(p) {
        if (!p.isReferencedIdentifier()) return;
        const n = p.node.name;
        if (p.scope.hasBinding(n, true)) return;
        const r = libLocals[n];
        if (!r) return;
        if (r.lib === 'vite') throw new Error(`${chunk.file} still references Vite helper ${n}`);
        const name = r.lib === 'three' ? threeModuleMap[n]?.name : r.names?.[n] ?? (r.namesMap ? readJSON(r.namesMap)[n] : undefined);
        if (!name) throw new Error(`${chunk.file} references ${r.lib} local ${n} with no known export name`);
        needed.set(n, { source: r.source, name });
      },
    });
    const bySource = new Map();
    for (const [local, v] of needed) {
      if (!bySource.has(v.source)) bySource.set(v.source, []);
      bySource.get(v.source).push(v.name === 'default' ? t.importDefaultSpecifier(t.identifier(local)) : t.importSpecifier(t.identifier(local), t.identifier(v.name)));
    }
    body.unshift(...[...bySource].map(([source, specs]) => t.importDeclaration(specs, t.stringLiteral(source))));
  }

  // 6. syntax
  unminify(ast);
  declarationsFromExpressions(ast);
  const threeLocals = new Map();
  for (const s of body) {
    if (t.isImportDeclaration(s) && s.source.value === 'three') for (const sp of s.specifiers) threeLocals.set(sp.imported.name, sp.local.name);
  }
  let threeImport = null;
  restoreNumbers(ast, {
    threeName(local, p) {
      const b = p.scope.getBinding(local);
      if (!b || b.kind !== 'module') return null;
      const decl = b.path.parentPath.node;
      return decl.source.value === 'three' && b.path.node.imported ? b.path.node.imported.name : null;
    },
    useThree(name) {
      if (!threeLocals.has(name)) {
        if (!threeImport) {
          threeImport = t.importDeclaration([], t.stringLiteral('three'));
          body.unshift(threeImport);
        }
        threeImport.specifiers.push(t.importSpecifier(t.identifier(name), t.identifier(name)));
        threeLocals.set(name, name);
      }
      return t.identifier(threeLocals.get(name));
    },
  });
  constify(ast);
  st.code = code;
}

// ---- naming -------------------------------------------------------------------------------
const finalExport = {}; // chunk file → export name → rec
for (const chunk of APP_CHUNKS) {
  const st = state[chunk.file];
  const collected = (st.collected = collect(st.ast, chunk.name));
  const programScope = collected.records.find((r) => r.scope.path.isProgram())?.scope;
  const recByLocal = new Map(collected.records.filter((r) => r.scope === programScope).map((r) => [r.name, r]));
  const wants = [];
  // exported names that must survive (dynamic imports read them)
  for (const [exp, local] of Object.entries(st.exportList)) {
    const rec = recByLocal.get(local);
    if (!rec) throw new Error(`${chunk.file}: exported ${local} not found`);
    finalExport[chunk.file] ??= {};
    finalExport[chunk.file][exp] = rec;
    if (isValidName(exp) && exp.length > 2) wants.push({ rec, names: [exp], prio: 0 });
  }
  // imports
  for (const r of collected.records) {
    if (r.binding.kind !== 'module') continue;
    const sp = r.binding.path.node;
    const decl = r.binding.path.parentPath.node;
    const from = srcFile(decl.source.value);
    if (chunkByFile[from]) {
      const exp = sp.imported.name;
      st.appImports.set(r, { chunk: from, export: exp });
      const src = finalExport[from]?.[exp];
      if (!src) throw new Error(`${chunk.file}: ${from} export ${exp} not resolved yet`);
      wants.push({ rec: r, names: [src.final], prio: 2 });
    } else if (t.isImportDefaultSpecifier(sp)) {
      wants.push({ rec: r, names: [DEFAULT_IMPORT_NAMES[decl.source.value] ?? 'lib'], prio: 2 });
    } else {
      wants.push({ rec: r, names: [sp.imported.name], prio: 2 });
    }
  }
  // the plan (reviewed names)
  for (const r of collected.records) {
    const n = PLAN.names[r.id];
    if (n) wants.push({ rec: r, names: Array.isArray(n) ? n : [n], prio: 1 });
  }
  planNames(collected, wants);
  // heuristics for the rest, outer scopes first, so suggestions can use outer final names
  const finalOf = (name, p) => {
    const b = p.scope.getBinding(name);
    const rec = b && collected.byBinding.get(b);
    return rec ? rec.final : null;
  };
  const named = new Set(wants.map((w) => w.rec));
  const heur = [];
  for (const r of collected.records) {
    if (named.has(r) || r.final.length > 2) continue;
    let s = null;
    try {
      s = suggest(r, finalOf);
    } catch (e) {
      s = null;
    }
    if (s) heur.push({ rec: r, names: Array.isArray(s) ? s : [s], prio: 3 });
  }
  planNames(collected, heur);
  applyNames(st.ast, collected);
  shorthand(st.ast);
  // fresh scope for segmentation
  st.collected = collect(st.ast, chunk.name);
  st.seg = segment(st.ast, st.collected);
  st.recById = new Map(st.collected.records.map((r) => [r.id, r]));
}

// re-resolve cross-chunk imports against the fresh records
const exportRec = {};
for (const chunk of APP_CHUNKS) {
  const st = state[chunk.file];
  const programScope = st.collected.records.find((r) => r.scope.path.isProgram())?.scope;
  exportRec[chunk.file] = {};
  for (const [exp, rec] of Object.entries(finalExport[chunk.file] ?? {})) exportRec[chunk.file][exp] = st.recById.get(rec.id);
  st.appImports = new Map();
  for (const r of st.collected.records) {
    if (r.binding.kind !== 'module' || r.scope !== programScope) continue;
    const decl = r.binding.path.parentPath.node;
    const from = srcFile(decl.source.value);
    if (chunkByFile[from]) st.appImports.set(r, { chunk: from, export: r.binding.path.node.imported.name });
  }
}

// ---- files --------------------------------------------------------------------------------
function defaultPath(chunk) {
  if (chunk.defaultPath) return chunk.defaultPath;
  if (chunk.main) return 'main.js';
  if (chunk.dir === 'shared') return `shared/${chunk.name}.js`;
  return `${chunk.dir}/index.js`;
}

const fileOfStmt = new Map(); // chunk file → array stmt index → file path
const filesOfChunk = {};
for (const chunk of APP_CHUNKS) {
  const st = state[chunk.file];
  const body = st.ast.program.body;
  const units = st.seg.units;
  const spec = PLAN.files[chunk.file]?.filter((f) => !LIB_RANGES[chunk.file]?.some((r) => f.at >= r.from && f.at < r.to));
  const files = [];
  if (spec && spec.length) {
    const byKey = new Map(units.map((u, i) => [u.key, i]));
    const starts = spec.map((f) => {
      const i = byKey.get(f.at);
      if (i === undefined) throw new Error(`${chunk.file}: plan file ${f.path} starts at ${f.at}, which is not a unit start`);
      return { ...f, unit: i };
    }).sort((a, b) => a.unit - b.unit);
    if (starts[0].unit !== 0) throw new Error(`${chunk.file}: the first file must start at the first unit`);
    // a path given twice: one file when nothing lies between, else a numbered sibling
    const merged = starts.filter((f, k) => k === 0 || f.path !== starts[k - 1].path);
    const seen = new Map();
    for (const f of merged) {
      const n = (seen.get(f.path) ?? 0) + 1;
      seen.set(f.path, n);
      if (n > 1) f.path = f.path.replace(/\.js$/, `-${n}.js`);
    }
    merged.forEach((f, k) => files.push({ path: f.path, header: f.header, units: units.slice(f.unit, k + 1 < merged.length ? merged[k + 1].unit : units.length) }));
  } else {
    files.push({ path: defaultPath(chunk), units, header: PLAN.headers[chunk.file] });
  }
  const map = new Array(body.length).fill(null);
  for (const f of files) for (const u of f.units) for (let i = u.from; i <= u.to; i++) map[i] = f.path;
  fileOfStmt.set(chunk.file, map);
  filesOfChunk[chunk.file] = files;
}

{
  const owner = new Map();
  for (const [c, files] of Object.entries(filesOfChunk)) {
    for (const f of files) {
      if (owner.has(f.path) && owner.get(f.path) !== c) throw new Error(`${f.path} is planned for both ${owner.get(f.path)} and ${c}`);
      if (WORKERS.some((w) => w.path === f.path)) throw new Error(`${f.path} is the worker's path`);
      owner.set(f.path, c);
    }
    if (new Set(files.map((f) => f.path)).size !== files.length) throw new Error(`${c}: a file path is planned twice`);
  }
}

function fileOfRec(chunkFile, rec) {
  const st = state[chunkFile];
  const i = st.seg.declIndex.get(rec);
  if (i === undefined) throw new Error(`${chunkFile}: ${rec.final} has no declaring statement`);
  return fileOfStmt.get(chunkFile)[i];
}

// who uses what across files
const usedElsewhere = new Map(); // rec → Set(file paths)
const entryOf = {}; // chunk file → file path holding the dynamic-import interface
for (const chunk of APP_CHUNKS) {
  const st = state[chunk.file];
  const map = fileOfStmt.get(chunk.file);
  for (const o of st.collected.occurrences) {
    if (!o.rec || !st.seg.declIndex.has(o.rec)) continue;
    const i = topIndex(o.path);
    const f = map[i];
    const home = map[st.seg.declIndex.get(o.rec)];
    if (f && home && f !== home) {
      if (!usedElsewhere.has(o.rec)) usedElsewhere.set(o.rec, new Set());
      usedElsewhere.get(o.rec).add(f);
    }
  }
  for (const [r, imp] of st.appImports) {
    const src = exportRec[imp.chunk][imp.export];
    if (!src) throw new Error(`${chunk.file}: unresolved import ${imp.export} from ${imp.chunk}`);
    if (!usedElsewhere.has(src)) usedElsewhere.set(src, new Set());
    usedElsewhere.get(src).add(`${chunk.file}`);
  }
  const iface = exportRec[chunk.file]?.create ?? exportRec[chunk.file]?.mountAudioTest;
  entryOf[chunk.file] = iface ? fileOfRec(chunk.file, iface) : filesOfChunk[chunk.file].at(-1).path;
}

const outSrc = path.join(outDir, 'src');
const review = path.join(outDir, '.decompile');
fs.rmSync(outSrc, { recursive: true, force: true });
fs.rmSync(review, { recursive: true, force: true });
fs.mkdirSync(outSrc, { recursive: true });
fs.mkdirSync(path.join(review, 'bindings'), { recursive: true });
const PRETTIER = { parser: 'babel', singleQuote: true, printWidth: 120, trailingComma: 'all' };

const unitsReport = {};
for (const chunk of APP_CHUNKS) {
  const st = state[chunk.file];
  const body = st.ast.program.body;
  const map = fileOfStmt.get(chunk.file);
  const programScope = st.collected.records.find((r) => r.scope.path.isProgram())?.scope;
  const recOfDecl = new Map();
  for (const r of st.collected.records) if (r.scope === programScope && st.seg.declIndex.has(r)) recOfDecl.set(r, map[st.seg.declIndex.get(r)]);
  unitsReport[chunk.file] = st.seg.units.map((u, i) => ({ unit: i, at: u.key, names: body.slice(u.from, u.to + 1).flatMap((s) => Object.keys(t.getBindingIdentifiers(s.declaration ?? s))).slice(0, 12) }));

  for (const file of filesOfChunk[chunk.file]) {
    const stmts = [];
    for (const u of file.units) for (let i = u.from; i <= u.to; i++) stmts.push({ node: body[i], index: i, unit: u });
    // references from this file
    const imports = new Map(); // source path/specifier → Map(imported → local)
    const addImport = (source, imported, local) => {
      if (!imports.has(source)) imports.set(source, new Map());
      imports.get(source).set(local, imported);
    };
    const inFile = new Set(stmts.map((s) => s.index));
    for (const o of st.collected.occurrences) {
      if (!o.rec || o.rec.scope !== programScope) continue;
      const i = topIndex(o.path);
      if (!inFile.has(i)) continue;
      const r = o.rec;
      if (r.binding.kind === 'module') {
        const imp = st.appImports.get(r);
        if (imp) {
          const src = exportRec[imp.chunk][imp.export];
          const home = fileOfRec(imp.chunk, src);
          addImport(relPath(file.path, home), src.final, r.final);
        } else {
          const decl = r.binding.path.parentPath.node;
          const sp = r.binding.path.node;
          addImport(decl.source.value, t.isImportDefaultSpecifier(sp) ? 'default' : sp.imported.name, r.final);
        }
      } else {
        const home = map[st.seg.declIndex.get(r)];
        if (home !== file.path) addImport(relPath(file.path, home), r.final, r.final);
      }
    }
    // exports
    const exported = new Map(); // rec → export name
    for (const r of recOfDecl.keys()) {
      if (recOfDecl.get(r) !== file.path) continue;
      if (usedElsewhere.has(r)) exported.set(r, r.final);
    }
    const iface = Object.entries(exportRec[chunk.file] ?? {}).filter(([exp]) => exp.length > 2 && isValidName(exp));
    const reexports = [];
    if (entryOf[chunk.file] === file.path) {
      for (const [exp, r] of iface) {
        if (recOfDecl.get(r) === file.path) exported.set(r, exp);
        else reexports.push({ exp, local: r.final, from: relPath(file.path, recOfDecl.get(r)) });
      }
    }
    // generate
    const outBody = [];
    const trailing = [];
    const exportsAt = new Map(); // stmt index → [[rec, export name]]
    for (const [r, exp] of exported) {
      const i = st.seg.declIndex.get(r);
      if (!exportsAt.has(i)) exportsAt.set(i, []);
      exportsAt.get(i).push([r, exp]);
    }
    const marking = !spec(chunk);
    for (const { node, index, unit } of stmts) {
      if (marking && unit.from === index) {
        const k = st.seg.units.indexOf(unit);
        node.leadingComments = [{ type: 'CommentLine', value: ` ── unit ${k} @${unit.key} ──` }, ...(node.leadingComments ?? [])];
      }
      const exps = exportsAt.get(index) ?? [];
      const simple = (t.isFunctionDeclaration(node) || t.isClassDeclaration(node) || (t.isVariableDeclaration(node) && node.declarations.length === 1 && t.isIdentifier(node.declarations[0].id))) && exps.length === 1 && exps[0][1] === exps[0][0].final;
      if (simple) {
        const wrapped = t.exportNamedDeclaration(node, []);
        wrapped.leadingComments = node.leadingComments;
        node.leadingComments = null;
        outBody.push(wrapped);
      } else {
        outBody.push(node);
        for (const [r, exp] of exps) trailing.push(t.exportSpecifier(t.identifier(r.final), t.identifier(exp)));
      }
    }
    if (trailing.length) outBody.push(t.exportNamedDeclaration(null, trailing));
    for (const re of reexports) outBody.push(t.exportNamedDeclaration(null, [t.exportSpecifier(t.identifier(re.local), t.identifier(re.exp))], t.stringLiteral(re.from)));
    // asset paths (dynamic imports, worker URLs) relative to this file
    const fixups = [];
    for (const n of outBody) {
      t.traverseFast(n, (x) => {
        if (t.isStringLiteral(x) && x.__dcChunk) fixups.push([x, 'value', relPath(file.path, entryOf[x.__dcChunk])]);
        if (t.isStringLiteral(x) && x.__dcAsset) fixups.push([x, 'value', relPath(file.path, x.__dcAsset)]);
      });
    }
    for (const [x, k, v] of fixups) {
      x[k] = v;
      delete x.extra;
    }
    const importDecls = [];
    const order = (s) => (s.startsWith('.') ? 2 : s === 'three' || s.startsWith('three/') ? 0 : 1);
    for (const [source, specs] of [...imports].sort((a, b) => order(a[0]) - order(b[0]) || a[0].localeCompare(b[0]))) {
      const list = [...specs].sort((a, b) => a[1].localeCompare(b[1]));
      const def = list.find(([, imported]) => imported === 'default');
      const named = list.filter(([, imported]) => imported !== 'default').map(([local, imported]) => t.importSpecifier(t.identifier(local), t.identifier(imported)));
      importDecls.push(t.importDeclaration([...(def ? [t.importDefaultSpecifier(t.identifier(def[0]))] : []), ...named], t.stringLiteral(source)));
    }
    const program = t.program([...importDecls, ...outBody], [], 'module');
    const code = generate(t.file(program));
    const header = file.header ? `/**\n${file.header.split('\n').map((l) => ` * ${l}`.trimEnd()).join('\n')}\n */\n` : '';
    let formatted;
    try {
      formatted = await prettier.format(header + code, PRETTIER);
    } catch (e) {
      fs.mkdirSync(path.dirname(path.join(review, 'failed', file.path)), { recursive: true });
      fs.writeFileSync(path.join(review, 'failed', file.path), header + code);
      throw new Error(`${file.path}: prettier failed: ${e.message}`);
    }
    const dest = path.join(outSrc, file.path);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, formatted);
    writeBindingIndex(file.path, formatted, stmts.map((s) => s.node), st);
  }
}
fs.writeFileSync(path.join(review, 'units.json'), JSON.stringify(unitsReport, null, 1));

function spec(chunk) {
  return PLAN.files[chunk.file]?.length;
}

/** line:name → binding id, for renames given against this file. */
function writeBindingIndex(filePath, formatted, nodes, st) {
  const declIds = new Map();
  for (const r of st.collected.records) if (r.binding.kind !== 'module') declIds.set(r.binding.identifier, r);
  const before = [];
  for (const n of nodes) walk(n, (x) => declIds.has(x) && before.push(declIds.get(x)));
  const ast2 = parse(formatted);
  const decl2 = new Set();
  traverse(ast2, {
    Scopable(p) {
      for (const b of Object.values(p.scope.bindings)) if (b.kind !== 'module') decl2.add(b.identifier);
    },
  });
  const after = [];
  for (const n of ast2.program.body) if (!t.isImportDeclaration(n)) walk(n, (x) => decl2.has(x) && after.push(x));
  const index = {};
  let mismatch = 0;
  for (let i = 0; i < Math.min(before.length, after.length); i++) {
    if (before[i].final !== after[i].name) mismatch++;
    let key = `${after[i].loc.start.line}:${after[i].name}`;
    for (let k = 2; index[key]; k++) key = `${after[i].loc.start.line}:${after[i].name}#${k}`;
    index[key] = before[i].id;
  }
  if (before.length !== after.length || mismatch) console.warn(`[index] ${filePath}: ${before.length} vs ${after.length} bindings, ${mismatch} mismatched`);
  const dest = path.join(review, 'bindings', filePath + '.json');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(index));
}

function walk(node, fn) {
  const seen = new Set();
  (function go(n) {
    if (!n || typeof n.type !== 'string' || seen.has(n)) return;
    seen.add(n);
    fn(n);
    for (const k of t.VISITOR_KEYS[n.type] ?? []) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach(go);
      else go(v);
    }
  })(node);
}

// ---- workers and styles -------------------------------------------------------------------
for (const w of WORKERS) {
  const code = fs.readFileSync(path.join(assetsDir, w.file), 'utf8');
  const ast = parse(code, 'module');
  // unwrap the IIFE Vite wrapped the worker module in
  const b = ast.program.body;
  if (b.length === 1 && t.isExpressionStatement(b[0]) && t.isCallExpression(b[0].expression) && t.isFunctionExpression(b[0].expression.callee) && !b[0].expression.arguments.length) {
    ast.program.body = b[0].expression.callee.body.body;
  }
  unminify(ast);
  declarationsFromExpressions(ast);
  restoreNumbers(ast, { threeName: () => null, useThree: () => { throw new Error('worker uses three'); } });
  constify(ast);
  const collected = collect(ast, w.file.replace(/-.*$/, ''));
  const wants = [];
  for (const r of collected.records) {
    const n = PLAN.names[r.id];
    if (n) wants.push({ rec: r, names: Array.isArray(n) ? n : [n], prio: 1 });
  }
  planNames(collected, wants);
  const finalOf = (name, p) => {
    const bb = p.scope.getBinding(name);
    const rec = bb && collected.byBinding.get(bb);
    return rec ? rec.final : null;
  };
  const named = new Set(wants.map((x) => x.rec));
  const heur = [];
  for (const r of collected.records) {
    if (named.has(r) || r.final.length > 2) continue;
    const s = suggest(r, finalOf);
    if (s) heur.push({ rec: r, names: Array.isArray(s) ? s : [s], prio: 3 });
  }
  planNames(collected, heur);
  applyNames(ast, collected);
  shorthand(ast);
  const header = PLAN.headers[w.file] ? `/**\n${PLAN.headers[w.file].split('\n').map((l) => ` * ${l}`.trimEnd()).join('\n')}\n */\n` : '';
  const formatted = await prettier.format(header + generate(ast), PRETTIER);
  const dest = path.join(outSrc, w.path);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, formatted);
  const st2 = { collected: collect(ast, w.file.replace(/-.*$/, '')) };
  writeBindingIndex(w.path, formatted, ast.program.body, st2);
}

for (const s of STYLES) {
  let css = fs.readFileSync(path.join(assetsDir, s.file), 'utf8');
  css = css.replace(/url\(\/assets\/((cinzel|nunito)-[a-z0-9-]+?)-[A-Za-z0-9_-]{8}\.(woff2?)\)/g, (_, stem, family, ext) => `url(${FONT_URLS[family]}${stem}.${ext})`);
  if (/url\(\/assets\//.test(css)) throw new Error(`${s.file}: unmapped asset url`);
  const formatted = await prettier.format(css, { parser: 'css', printWidth: 120 });
  const dest = path.join(outSrc, s.path);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, (PLAN.headers[s.file] ? `/* ${PLAN.headers[s.file]} */\n` : '') + formatted);
}

// ---- the page -----------------------------------------------------------------------------
{
  let html = fs.readFileSync(path.join(assetsDir, '..', 'index.html'), 'utf8');
  html = html.replace(/\s*<script type="module" crossorigin src="\/assets\/index-[^"]+\.js"><\/script>/, '');
  html = html.replace(/\s*<link rel="modulepreload"[^>]*>/g, '');
  const head = [
    `<script type="importmap">${JSON.stringify(IMPORT_MAP)}</script>`,
    ...STYLES.map((s) => `<link rel="stylesheet" href="./src/${s.path}" />`),
    `<script type="module" src="./src/main.js"></script>`,
  ].map((l) => `    ${l}\n`).join('');
  html = html.replace('  </head>', `${head}  </head>`);
  if (!html.includes('./src/main.js')) throw new Error('index.html: no </head>');
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
}

console.log('decompiled', Object.values(filesOfChunk).reduce((n, f) => n + f.length, 0), 'modules');
