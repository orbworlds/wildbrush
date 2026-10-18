// Module structure of a decompiled chunk: "units" (maximal runs of top-level statements that can
// be cut apart — nothing before a cut refers to anything after it, and no binding is assigned
// across it, which every original module boundary satisfies), files made of consecutive units,
// and the imports/exports that link the files.
import * as t from '@babel/types';

export function stmtKey(stmt) {
  if (stmt.start != null) return stmt.start;
  let k = null;
  t.traverseFast(stmt, (n) => {
    if (k == null && n.start != null) k = n.start;
  });
  return k;
}

/** Top-level statement index of a path. */
export function topIndex(path) {
  let p = path;
  while (p.parentPath && !p.parentPath.isProgram()) p = p.parentPath;
  return p.parentPath ? p.key : -1;
}

/**
 * Units of the program body. Returns { units: [{ from, to, key }], declIndex: Map(rec → stmt) }.
 */
export function segment(ast, collected) {
  const body = ast.program.body;
  const isCode = (s) => !t.isImportDeclaration(s) && !(t.isExportNamedDeclaration(s) && !s.declaration) && !t.isExportAllDeclaration(s);
  const programScope = collected.records.find((r) => r.scope.path.isProgram())?.scope;
  const declIndex = new Map();
  for (const r of collected.records) {
    if (r.scope !== programScope || r.binding.kind === 'module') continue;
    declIndex.set(r, topIndex(r.binding.path));
  }
  const n = body.length;
  const maxRef = new Array(n).fill(-1);
  const noCut = new Array(n).fill(false);
  for (const o of collected.occurrences) {
    if (!o.rec || !declIndex.has(o.rec)) continue;
    const i = topIndex(o.path);
    const d = declIndex.get(o.rec);
    if (i < 0) continue;
    if (d > maxRef[i]) maxRef[i] = d;
    // an assignment from another statement ties the two together
    const isWrite = o.path.isBindingIdentifier() && o.node !== o.rec.binding.identifier;
    if (isWrite && i !== d) for (let k = Math.min(i, d); k < Math.max(i, d); k++) noCut[k] = true;
  }
  const units = [];
  let start = -1;
  let reach = -1;
  for (let i = 0; i < n; i++) {
    if (!isCode(body[i])) continue;
    if (start < 0) start = i;
    reach = Math.max(reach, maxRef[i], i);
    let next = i + 1;
    while (next < n && !isCode(body[next])) next++;
    const last = next >= n;
    if (last || (reach <= i && !noCut[i])) {
      units.push({ from: start, to: i, key: stmtKey(body[start]) });
      start = -1;
    }
  }
  return { units, declIndex };
}

export function relPath(fromFile, toFile) {
  const a = fromFile.split('/').slice(0, -1);
  const b = toFile.split('/');
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  const up = a.length - i;
  const rest = b.slice(i).join('/');
  return (up ? '../'.repeat(up) : './') + rest;
}
