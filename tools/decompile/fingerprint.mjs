// Top-level items of a module and their minification-proof fingerprints: property names, object
// keys, strings, numbers and globals survive minification; local names do not.
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';

const traverse = _traverse.default ?? _traverse;

export function parseModule(src) {
  return parse(src, {
    sourceType: 'module',
    plugins: ['classProperties', 'classPrivateProperties', 'classPrivateMethods', 'topLevelAwait', 'importMeta'],
    errorRecovery: false,
  });
}

function tokensOf(path, out) {
  const add = (t) => out.set(t, (out.get(t) || 0) + 1);
  path.traverse({
    MemberExpression(p) {
      if (!p.node.computed && p.node.property.type === 'Identifier') add('.' + p.node.property.name);
    },
    OptionalMemberExpression(p) {
      if (!p.node.computed && p.node.property.type === 'Identifier') add('.' + p.node.property.name);
    },
    'ObjectProperty|ObjectMethod|ClassMethod|ClassProperty|ClassPrivateProperty'(p) {
      const k = p.node.key;
      if (!p.node.computed && k) add('k:' + (k.name ?? k.value ?? (k.id && k.id.name)));
    },
    StringLiteral(p) {
      add('s:' + p.node.value.slice(0, 80));
    },
    TemplateElement(p) {
      const v = p.node.value.cooked ?? p.node.value.raw;
      if (v && v.trim()) add('s:' + v.slice(0, 80));
    },
    NumericLiteral(p) {
      add('n:' + p.node.value);
    },
    Identifier(p) {
      if (!p.isReferencedIdentifier()) return;
      const name = p.node.name;
      if (!p.scope.hasBinding(name, true)) add('g:' + name);
    },
    'FunctionExpression|FunctionDeclaration|ArrowFunctionExpression|ClassMethod|ObjectMethod'(p) {
      add('fn' + p.node.params.length);
    },
    ClassBody() {
      add('class');
    },
  });
}

/** Items: one per declarator / function / class / other statement, in source order. */
export function topItems(src, ast = parseModule(src)) {
  const items = [];
  traverse(ast, {
    Program(prog) {
      for (const st of prog.get('body')) {
        let s = st;
        if (s.isExportNamedDeclaration() && s.node.declaration) s = s.get('declaration');
        else if (s.isExportDefaultDeclaration()) s = s.get('declaration');
        if (s.isVariableDeclaration()) {
          for (const d of s.get('declarations')) {
            const tokens = new Map();
            if (d.node.init) tokensOf(d, tokens);
            const init = d.node.init;
            const kind = !init ? 'empty' : init.type === 'ClassExpression' ? 'class' : /Function/.test(init.type) ? 'function' : init.type;
            items.push({ name: d.node.id.type === 'Identifier' ? d.node.id.name : null, kind, start: d.node.start, end: d.node.end, stmtStart: st.node.start, stmtEnd: st.node.end, tokens });
          }
        } else if (s.isFunctionDeclaration() || s.isClassDeclaration()) {
          const tokens = new Map();
          tokensOf(s, tokens);
          if (s.isClassDeclaration()) tokens.set('class', (tokens.get('class') || 0));
          items.push({ name: s.node.id?.name ?? null, kind: s.isClassDeclaration() ? 'class' : 'function', start: s.node.start, end: s.node.end, stmtStart: st.node.start, stmtEnd: st.node.end, tokens });
        } else if (s.isImportDeclaration() || s.isExportNamedDeclaration() || s.isExportAllDeclaration()) {
          // module plumbing: not an item
        } else {
          const tokens = new Map();
          tokensOf(s, tokens);
          items.push({ name: null, kind: 'stmt:' + s.node.type, start: s.node.start, end: s.node.end, stmtStart: st.node.start, stmtEnd: st.node.end, tokens });
        }
      }
    },
  });
  return items;
}

/** TF-IDF weighted cosine similarity between fingerprints. */
export function makeSimilarity(allItems) {
  const df = new Map();
  for (const it of allItems) for (const t of it.tokens.keys()) df.set(t, (df.get(t) || 0) + 1);
  const N = allItems.length;
  const idf = (t) => Math.log(1 + N / (df.get(t) || 1));
  const norm = new WeakMap();
  const vecNorm = (it) => {
    let n = norm.get(it);
    if (n === undefined) {
      n = 0;
      for (const [t, c] of it.tokens) n += (c * idf(t)) ** 2;
      n = Math.sqrt(n);
      norm.set(it, n);
    }
    return n;
  };
  return (a, b) => {
    if (!a.tokens.size || !b.tokens.size) return a.kind === b.kind && !a.tokens.size && !b.tokens.size ? 0.05 : 0;
    let dot = 0;
    const [s, l] = a.tokens.size < b.tokens.size ? [a, b] : [b, a];
    for (const [t, c] of s.tokens) {
      const d = l.tokens.get(t);
      if (d) dot += Math.min(c, d) * Math.max(c, d) * idf(t) ** 2;
    }
    const sim = dot / (vecNorm(a) * vecNorm(b));
    const kindOk = a.kind === b.kind || (a.kind.startsWith('stmt') && b.kind.startsWith('stmt'));
    return kindOk ? sim : sim * 0.6;
  };
}

/**
 * Monotonic alignment (Needleman-Wunsch without gap penalties) of minified items A against
 * reference items B, maximising the summed similarity of matched pairs above `min`.
 */
export function align(A, B, sim, min = 0.25) {
  const n = A.length, m = B.length;
  const W = m + 1;
  const score = new Float64Array((n + 1) * (m + 1));
  const move = new Uint8Array((n + 1) * (m + 1)); // 1 = match, 2 = skip A, 3 = skip B
  const simCache = new Float32Array(n * m);
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) simCache[i * m + j] = sim(A[i], B[j]);
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      if (i === 0 && j === 0) continue;
      let best = -1, mv = 0;
      if (i > 0 && j > 0) {
        const s = simCache[(i - 1) * m + (j - 1)];
        if (s >= min) {
          const v = score[(i - 1) * W + (j - 1)] + s;
          if (v > best) { best = v; mv = 1; }
        }
      }
      if (i > 0) { const v = score[(i - 1) * W + j]; if (v > best) { best = v; mv = 2; } }
      if (j > 0) { const v = score[i * W + (j - 1)]; if (v > best) { best = v; mv = 3; } }
      score[i * W + j] = best;
      move[i * W + j] = mv;
    }
  }
  const pairs = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    const mv = move[i * W + j];
    if (mv === 1) { pairs.push([i - 1, j - 1, simCache[(i - 1) * m + (j - 1)]]); i--; j--; }
    else if (mv === 2) i--;
    else j--;
  }
  return pairs.reverse();
}
