// Identifier naming for the decompiled chunks: collects every binding with a stable id (its
// declaration's offset in the minified chunk), plans new names without changing what any
// identifier resolves to, applies them, and verifies that every reference still resolves to
// the same binding. Name suggestions come from the plan (hand/LLM review), from library imports
// and from heuristics on how a binding is declared and used.
import * as t from '@babel/types';
import { traverse } from './babel.mjs';

export const RESERVED = new Set(('break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with yield let static implements interface package private protected public await arguments eval undefined NaN Infinity ' +
  'window document self globalThis console Math JSON Object Array Map Set WeakMap WeakSet Promise Symbol Error TypeError Number String Boolean Date RegExp Reflect Proxy Intl location navigator performance localStorage sessionStorage fetch setTimeout clearTimeout setInterval clearInterval requestAnimationFrame cancelAnimationFrame queueMicrotask structuredClone URL URLSearchParams Blob File Image Audio Event CustomEvent Worker name parent top status length event frames history screen origin close open print alert confirm prompt crypto caches indexedDB').split(/\s+/));

export function isValidName(n) {
  return typeof n === 'string' && /^[A-Za-z_$][\w$]*$/.test(n) && !RESERVED.has(n);
}

export function camel(s) {
  const parts = String(s).replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  let out = parts.map((p, i) => (i ? p[0].toUpperCase() + p.slice(1) : p[0].toLowerCase() + p.slice(1))).join('');
  if (/^\d/.test(out)) out = '_' + out;
  return out;
}

const lowerFirst = (s) => s[0].toLowerCase() + s.slice(1);

const IRREGULAR = { children: 'child', indices: 'index', vertices: 'vertex', matrices: 'matrix', leaves: 'leaf', people: 'person', data: 'datum', axes: 'axis', mice: 'mouse', halves: 'half', wolves: 'wolf', shelves: 'shelf', lives: 'life', knives: 'knife' };
export function singular(name) {
  if (!name) return 'item';
  const base = name.replace(/^_+/, '');
  const m = base.match(/^(.*?)([A-Z]?[a-z]+)$/);
  const head = m ? m[1] : '';
  const last = m ? m[2] : base;
  const lower = last.toLowerCase();
  const cap = (w) => (head && last[0] === last[0].toUpperCase() ? w[0].toUpperCase() + w.slice(1) : w);
  if (IRREGULAR[lower]) return lowerFirst(head + cap(IRREGULAR[lower]));
  if (/(list|array|arr|queue|stack|pool|set|map|all|batch|group|buffer|cache|registry|items)$/i.test(lower)) return lowerFirst(head + cap(lower === 'items' ? 'item' : 'item')) || 'item';
  if (/ies$/.test(lower)) return lowerFirst(head + cap(lower.slice(0, -3) + 'y'));
  if (/(ss|sh|ch|x|z)es$/.test(lower)) return lowerFirst(head + cap(lower.slice(0, -2)));
  if (/s$/.test(lower) && !/ss$/.test(lower) && lower.length > 3) return lowerFirst(head + cap(lower.slice(0, -1)));
  return 'item';
}

const CLASS_NAMES = {
  Vector2: 'vec2', Vector3: 'vec3', Vector4: 'vec4', Quaternion: 'quat', Matrix3: 'mat3', Matrix4: 'mat4', Color: 'color', Euler: 'euler',
  Box3: 'box', Box2: 'box2', Sphere: 'sphere', Ray: 'ray', Plane: 'plane', Raycaster: 'raycaster', Frustum: 'frustum', Spherical: 'spherical', Line3: 'line', Triangle: 'triangle',
  Mesh: 'mesh', InstancedMesh: 'mesh', SkinnedMesh: 'mesh', BatchedMesh: 'mesh', Points: 'points', Line: 'line', LineSegments: 'lines', LineLoop: 'line', Sprite: 'sprite',
  Group: 'group', Object3D: 'object', Scene: 'scene', PerspectiveCamera: 'camera', OrthographicCamera: 'camera', Bone: 'bone', Skeleton: 'skeleton',
  BufferGeometry: 'geometry', InstancedBufferGeometry: 'geometry', BufferAttribute: 'attribute', Float32BufferAttribute: 'attribute', InstancedBufferAttribute: 'attribute', Uint16BufferAttribute: 'attribute', Uint32BufferAttribute: 'attribute', InterleavedBuffer: 'buffer',
  WebGLRenderTarget: 'target', WebGLRenderer: 'renderer', Clock: 'clock', Timer: 'timer', Layers: 'layers', Fog: 'fog', FogExp2: 'fog', CubeCamera: 'cubeCamera', PMREMGenerator: 'pmrem',
  Map: 'map', Set: 'set', WeakMap: 'cache', WeakSet: 'seen', Array: 'arr', Float32Array: 'data', Float64Array: 'data', Uint8Array: 'bytes', Uint8ClampedArray: 'bytes', Uint16Array: 'data', Uint32Array: 'data', Int8Array: 'data', Int16Array: 'data', Int32Array: 'data',
  Promise: 'promise', Worker: 'worker', URL: 'url', URLSearchParams: 'params', Image: 'img', AudioContext: 'audioCtx', OfflineAudioContext: 'audioCtx', AbortController: 'controller', MutationObserver: 'observer', ResizeObserver: 'observer', IntersectionObserver: 'observer', Error: 'err', Date: 'date', TextDecoder: 'decoder', TextEncoder: 'encoder', OffscreenCanvas: 'canvas', ImageData: 'imageData', Path2D: 'path', DOMMatrix: 'matrix', Blob: 'blob', FileReader: 'reader',
};
function nameForClass(cls) {
  if (!cls) return null;
  if (CLASS_NAMES[cls]) return CLASS_NAMES[cls];
  if (/Geometry$/.test(cls)) return 'geometry';
  if (/Material$/.test(cls)) return 'material';
  if (/Texture$/.test(cls)) return 'texture';
  if (/Light$/.test(cls)) return 'light';
  if (/Helper$/.test(cls)) return 'helper';
  if (/Node$/.test(cls) && /Gain|Oscillator|BiquadFilter|Convolver|Delay|Panner|StereoPanner|AudioBufferSource|DynamicsCompressor|WaveShaper|ConstantSource|ChannelMerger|ChannelSplitter|Analyser|MediaElementAudioSource/.test(cls)) return lowerFirst(cls.replace(/Node$/, '').replace(/^AudioBufferSource$/, 'source'));
  return lowerFirst(cls);
}

const CTX_KEYS = new Set(['scene', 'renderer', 'camera', 'events', 'player', 'terrain', 'globals', 'time', 'physics', 'ui', 'RAPIER', 'colliders', 'input', 'params', 'settings', 'paint', 'environment', 'audio', 'enemies', 'interiors', 'water', 'character']);
const DT_METHODS = new Set(['update', 'lateUpdate', 'fixedUpdate', 'tick', 'step', 'render', 'animate', 'advance', 'simulate', 'integrate']);
const ARRAY_CB = new Set(['forEach', 'map', 'filter', 'find', 'findIndex', 'findLast', 'findLastIndex', 'some', 'every', 'flatMap']);

function memberName(n) {
  if (t.isIdentifier(n)) return n.name;
  if ((t.isMemberExpression(n) || t.isOptionalMemberExpression(n)) && !n.computed && t.isIdentifier(n.property)) return n.property.name;
  if (t.isThisExpression(n)) return 'this';
  return null;
}

/**
 * Heuristic name for a binding, or null. `finalOf(name, path)` returns the final (planned) name
 * of whatever `name` resolves to at `path` (so callee and class names read as their new names).
 */
export function suggest(rec, finalOf) {
  const b = rec.binding;
  const p = b.path;
  const node = b.identifier;
  // catch (err)
  if (p.isCatchClause()) return ['err', 'error'];
  // destructuring: { key: x } → key
  const parent = findParentPath(b, node);
  if (parent && parent.isObjectProperty() && parent.node.value === node && !parent.node.computed) {
    const k = parent.node.key.name ?? parent.node.key.value;
    if (typeof k === 'string') return camel(k);
  }
  if (parent && parent.isAssignmentPattern() && parent.parentPath.isObjectProperty() && !parent.parentPath.node.computed) {
    const k = parent.parentPath.node.key.name ?? parent.parentPath.node.key.value;
    if (typeof k === 'string') return camel(k);
  }
  if (b.kind === 'param') return suggestParam(rec, finalOf);
  if (p.isVariableDeclarator()) {
    const decl = p.parentPath;
    // for-of / for-in variables
    if (decl.parentPath.isForOfStatement() && decl.key === 'left') return suggestForOf(decl.parentPath, node, finalOf);
    if (decl.parentPath.isForInStatement() && decl.key === 'left') return ['key', 'k'];
    if (decl.parentPath.isForStatement() && decl.key === 'init') return loopIndexNames(decl.parentPath);
    const init = p.node.init;
    if (p.node.id !== node) {
      // inside an array pattern: [a, b] = …
      if (t.isArrayPattern(p.node.id) && t.isCallExpression(init) && memberName(init.callee) === 'split') return null;
      return null;
    }
    const s = suggestFromInit(init, p.get('init'), finalOf);
    if (s && decl.parentPath.isProgram() && t.isNewExpression(init) && /^(vec[234]|quat|mat[34]|color|euler|box2?|sphere|ray|plane|raycaster|matrix|frustum|spherical|line|triangle|object)$/.test(s)) return '_' + s;
    return s;
  }
  return null;
}

function findParentPath(b, node) {
  // the path whose node directly contains the binding identifier
  let found = null;
  const root = b.path;
  if (root.node === node) return root.parentPath;
  root.traverse({
    Identifier(q) {
      if (q.node === node) {
        found = q.parentPath;
        q.stop();
      }
    },
  });
  if (!found && root.isVariableDeclarator() && root.node.id === node) return root;
  return found;
}

function loopIndexNames(forPath) {
  let depth = 0;
  for (let q = forPath.parentPath; q && !q.isFunction() && !q.isProgram(); q = q.parentPath) if (q.isForStatement()) depth++;
  const order = ['i', 'j', 'k', 'l', 'm', 'q'];
  return [...order.slice(depth), ...order.slice(0, depth)];
}

function suggestForOf(forPath, node, finalOf) {
  const right = forPath.node.right;
  const left = forPath.node.left.declarations[0].id;
  let source = memberName(right);
  let kind = 'values';
  if (t.isCallExpression(right)) {
    const c = right.callee;
    const m = memberName(c);
    if (t.isMemberExpression(c) && t.isIdentifier(c.object, { name: 'Object' })) {
      source = memberName(right.arguments[0]);
      kind = m;
    } else if (m === 'values' || m === 'keys' || m === 'entries') {
      source = memberName(c.object);
      kind = m;
    } else if (m === 'slice' || m === 'filter' || m === 'concat' || m === 'reverse' || m === 'sort') {
      source = memberName(c.object);
    }
  } else if (t.isArrayExpression(right) && right.elements.length === 1 && t.isSpreadElement(right.elements[0])) {
    source = memberName(right.elements[0].argument);
  }
  if (source && finalOf && t.isIdentifier(right)) source = finalOf(source, forPath) ?? source;
  if (t.isArrayPattern(left)) {
    const idx = left.elements.indexOf(node);
    if (kind === 'entries' || idx >= 0) return idx === 0 ? ['key', 'k'] : idx === 1 ? (source ? [singular(source), 'value'] : ['value']) : null;
    return null;
  }
  if (left !== node) return null;
  if (kind === 'keys') return ['key', 'k'];
  return source ? singular(source) : 'item';
}

export function suggestFromInit(init, initPath, finalOf) {
  if (!init) return null;
  if (t.isAwaitExpression(init)) return suggestFromInit(init.argument, initPath?.get('argument'), finalOf);
  if (t.isNewExpression(init)) {
    const c = init.callee;
    const cls = t.isIdentifier(c) ? (finalOf?.(c.name, initPath) ?? c.name) : memberName(c);
    return cls && cls.length > 2 ? nameForClass(cls) : null;
  }
  if (t.isThisExpression(init)) return 'self';
  if ((t.isMemberExpression(init) || t.isOptionalMemberExpression(init)) && !init.computed && t.isIdentifier(init.property)) {
    const n = init.property.name;
    if (n === 'length') return ['len', 'count', 'n'];
    if (n === 'value' && memberName(init.object) && memberName(init.object) !== 'this') return camel(memberName(init.object)) ?? 'value';
    return n.length > 1 ? n : null;
  }
  if (t.isImport(init.callee) || t.isImportExpression?.(init)) return 'mod';
  if (t.isCallExpression(init) || t.isOptionalCallExpression(init)) {
    const c = init.callee;
    const arg0 = init.arguments[0];
    const str = t.isStringLiteral(arg0) ? arg0.value : t.isTemplateLiteral(arg0) && !arg0.expressions.length ? arg0.quasis[0].value.cooked : null;
    if (t.isImport(c)) return 'mod';
    let m = null;
    if ((t.isMemberExpression(c) || t.isOptionalMemberExpression(c)) && !c.computed && t.isIdentifier(c.property)) m = c.property.name;
    else if (t.isIdentifier(c)) m = finalOf?.(c.name, initPath) ?? c.name;
    if (!m) return null;
    const obj = t.isMemberExpression(c) || t.isOptionalMemberExpression(c) ? memberName(c.object) : null;
    if (m === 'createElement' && str) return str === 'canvas' ? 'canvas' : str === 'style' ? 'style' : str === 'div' ? ['el', 'div'] : camel(str) + 'El';
    if (m === 'createElementNS' && t.isStringLiteral(init.arguments[1])) return camel(init.arguments[1].value) + 'El';
    if (m === 'getContext') return str === '2d' ? ['g', 'ctx2d'] : 'gl';
    if ((m === 'getElementById' || m === 'querySelector') && str) return camel(str.replace(/^[#.]/, '')) ?? 'el';
    if (m === 'querySelectorAll') return 'els';
    if (m === 'now' && obj === 'performance') return ['now', 't0'];
    if (m === 'now' && obj === 'Date') return 'now';
    if (obj === 'Math') return { hypot: 'dist', atan2: 'angle', sqrt: null, random: 'rnd', floor: null, round: null, abs: null, min: null, max: null, sin: null, cos: null }[m] ?? null;
    if (obj === 'JSON' && m === 'parse') return 'data';
    if (obj === 'JSON' && m === 'stringify') return 'json';
    if (obj === 'Object' && (m === 'keys' || m === 'values' || m === 'entries')) return m;
    if (m === 'get' && str) return camel(str);
    if (m === 'getAttribute' && str) return camel(str);
    if (m === 'getItem' && str) return 'stored';
    if (m === 'split') return 'parts';
    if (m === 'getBoundingClientRect') return 'rect';
    if (m === 'getWorldPosition') return 'worldPos';
    if (m === 'getWorldDirection') return 'dir';
    if (m === 'clone' && obj && obj !== 'this') return null;
    if (m === 'createBuffer') return 'buffer';
    if (m === 'createGain') return 'gain';
    if (m === 'createOscillator') return 'osc';
    if (m === 'createBiquadFilter') return 'filter';
    if (m === 'createBufferSource') return 'source';
    if (m === 'createStereoPanner' || m === 'createPanner') return 'panner';
    if (m === 'createDynamicsCompressor') return 'compressor';
    if (m === 'createConvolver') return 'convolver';
    if (m === 'createDelay') return 'delay';
    if (m === 'createAnalyser') return 'analyser';
    if (m === 'getChannelData') return 'channel';
    if (m === 'createImageData' || m === 'getImageData') return 'imageData';
    if (m === 'createLinearGradient' || m === 'createRadialGradient') return 'gradient';
    if (m === 'getParameter') return null;
    if (m === 'castRay' || m === 'castRayAndGetNormal') return 'hit';
    if (m === 'createRigidBody') return 'body';
    if (m === 'createCollider') return 'collider';
    const mm = m.match(/^(?:get|create|make|build|compute|find|sample|read|load|spawn|pick|choose|resolve|parse|measure|clone|new)([A-Z]\w*)$/);
    if (mm) return lowerFirst(mm[1]);
    return null;
  }
  if (t.isArrowFunctionExpression(init) || t.isFunctionExpression(init)) return null;
  return null;
}

function suggestParam(rec, finalOf) {
  const b = rec.binding;
  const fnPath = b.scope.path;
  const fn = fnPath.node;
  const idx = fn.params.indexOf(b.identifier);
  const ap = fn.params.find((q) => t.isAssignmentPattern(q) && q.left === b.identifier);
  const index = idx >= 0 ? idx : ap ? fn.params.indexOf(ap) : -1;
  if (index < 0) return null;
  // this.X = param
  let assigned = null;
  for (const r of b.referencePaths) {
    const q = r.parentPath;
    if (q.isAssignmentExpression() && q.node.right === r.node && t.isMemberExpression(q.node.left) && t.isThisExpression(q.node.left.object) && t.isIdentifier(q.node.left.property)) {
      assigned = q.node.left.property.name.replace(/^_+/, '');
      break;
    }
  }
  if (assigned && assigned.length > 1) return assigned;
  // default values
  if (ap) {
    const r = ap.right;
    if (t.isMemberExpression(r) && t.isIdentifier(r.object, { name: 'Math' }) && t.isIdentifier(r.property, { name: 'random' })) return 'random';
    if (t.isNewExpression(r) && index > 0) return ['target', 'out'];
    if (t.isObjectExpression(r)) return ['options', 'opts'];
  }
  // ctx-shaped parameter
  const used = new Set();
  for (const r of b.referencePaths) {
    const q = r.parentPath;
    if ((q.isMemberExpression() || q.isOptionalMemberExpression()) && q.node.object === r.node && !q.node.computed && t.isIdentifier(q.node.property)) used.add(q.node.property.name);
  }
  let ctxHits = 0;
  for (const k of used) if (CTX_KEYS.has(k)) ctxHits++;
  if (ctxHits >= 2) return 'ctx';
  // method / function names
  const owner = fnPath.parentPath;
  let fname = null;
  if (fnPath.isClassMethod() || fnPath.isObjectMethod()) fname = fn.key?.name ?? null;
  else if (owner?.isObjectProperty() && owner.node.value === fn) fname = owner.node.key?.name ?? null;
  if (fname) {
    if (DT_METHODS.has(fname) && fn.params.length === 1) return 'dt';
    if (fname === 'create' && index === 0) return 'ctx';
    if (fname === 'constructor' && index === 0 && used.size === 0) return null;
    const set = fname.match(/^set([A-Z]\w*)$/);
    if (set && fn.params.length === 1) return lowerFirst(set[1]);
  }
  // callbacks
  if (owner && (owner.isCallExpression() || owner.isOptionalCallExpression() || owner.isNewExpression()) && owner.node.arguments.includes(fn)) {
    const c = owner.node.callee;
    const m = memberName(c);
    const obj = t.isMemberExpression(c) || t.isOptionalMemberExpression(c) ? c.object : null;
    if (owner.isNewExpression() && t.isIdentifier(c, { name: 'Promise' })) return index === 0 ? 'resolve' : index === 1 ? 'reject' : null;
    if (m === 'addEventListener' || m === 'removeEventListener') return index === 0 ? ['event', 'e'] : null;
    if (m === 'on' || m === 'once') return index === 0 ? ['data', 'payload'] : null;
    if (m === 'requestAnimationFrame') return index === 0 ? ['time', 'now'] : null;
    if (m === 'then') return index === 0 ? ['result', 'res'] : null;
    if (m === 'catch') return index === 0 ? ['err', 'error'] : null;
    if (m === 'sort') return index === 0 ? ['a', 'x'] : index === 1 ? ['b', 'y'] : null;
    if (m === 'reduce') return index === 0 ? ['acc', 'sum'] : index === 1 ? singular(memberName(obj)) : index === 2 ? ['i', 'index'] : null;
    if (ARRAY_CB.has(m)) {
      let src = memberName(obj);
      if (src && t.isIdentifier(obj) && finalOf) src = finalOf(src, owner) ?? src;
      if (index === 0) return src && src !== 'this' ? singular(src) : 'item';
      if (index === 1) return ['i', 'index'];
      return null;
    }
  }
  return null;
}

// ---- collection, planning, application -------------------------------------------------

/** Every binding of the program and every identifier that names a variable. */
export function collect(ast, chunk) {
  const records = [];
  const byIdent = new Map(); // declaration identifier node → record
  const occurrences = []; // { node, path, scope, rec|null, name }
  let fresh = 0;
  const register = (scope) => {
    if (scope.__dcSeen) return;
    scope.__dcSeen = true;
    for (const [name, binding] of Object.entries(scope.bindings)) {
      if (byIdent.has(binding.identifier)) continue;
      const start = binding.identifier.start;
      const rec = { id: start != null ? `${chunk}:${start}` : `${chunk}:new${fresh++}`, name, final: name, binding, scope: binding.scope, prio: 9, depth: depthOf(binding.scope) };
      records.push(rec);
      byIdent.set(binding.identifier, rec);
    }
  };
  // one traversal: scopes (and their Binding objects) are only consistent within a traversal
  traverse(ast, {
    Scopable: { enter(path) { register(path.scope); } },
    Identifier(path) {
      if (!(path.isReferencedIdentifier() || path.isBindingIdentifier())) return;
      // export { a as b }: only the local is a variable
      if (path.parentPath.isExportSpecifier() && path.parentPath.node.exported === path.node && path.parentPath.node.local !== path.node) return;
      if (path.parentPath.isImportSpecifier() && path.parentPath.node.imported === path.node && path.parentPath.node.local !== path.node) return;
      const name = path.node.name;
      // a declaration names its own binding (Babel would resolve `function x(x) {}`'s name from
      // inside the function, i.e. to the parameter)
      let rec = byIdent.get(path.node) ?? null;
      if (!rec) {
        const binding = path.scope.getBinding(name);
        if (binding) register(binding.scope);
        rec = binding ? byIdent.get(binding.identifier) ?? null : null;
      }
      occurrences.push({ node: path.node, path, scope: path.scope, rec, name });
    },
  });
  const byBinding = { get: (b) => (b ? byIdent.get(b.identifier) : undefined) };
  return { records, byBinding, byIdent, occurrences };
}

function depthOf(scope) {
  let d = 0;
  for (let s = scope; s; s = s.parent) d++;
  return d;
}

function isWithin(scope, ancestor) {
  for (let s = scope; s; s = s.parent) if (s === ancestor) return true;
  return false;
}

/**
 * Assign final names. `wants` is a list of { rec, names: [candidates], prio }; lower prio first.
 */
export function plan(collected, wants) {
  const { records, occurrences } = collected;
  // occurrences per record and per global name
  const occOf = new Map();
  const byFinal = new Map(); // final name → Set(occurrence)
  for (const o of occurrences) {
    if (o.rec) {
      if (!occOf.has(o.rec)) occOf.set(o.rec, []);
      occOf.get(o.rec).push(o);
    }
    const key = o.rec ? o.rec.final : o.name;
    if (!byFinal.has(key)) byFinal.set(key, new Set());
    byFinal.get(key).add(o);
  }
  // own-scope names in use
  const ownNames = new Map(); // scope → Map(final → rec)
  for (const r of records) {
    if (!ownNames.has(r.scope)) ownNames.set(r.scope, new Map());
    ownNames.get(r.scope).set(r.final, r);
  }
  const conflicts = (rec, n) => {
    const own = ownNames.get(rec.scope).get(n);
    if (own && own !== rec) return true;
    // our references must not be captured by a binding between them and our scope
    for (const o of occOf.get(rec) ?? []) {
      for (let s = o.scope; s && s !== rec.scope; s = s.parent) {
        const other = ownNames.get(s)?.get(n);
        if (other && other !== rec) return true;
      }
    }
    // references to something else named n inside our scope would be captured by us
    for (const o of byFinal.get(n) ?? []) {
      if (o.rec === rec) continue;
      if (!isWithin(o.scope, rec.scope)) continue;
      if (o.rec && isWithin(o.rec.scope, rec.scope) && o.rec.scope !== rec.scope) continue; // inner binding: shadows us there, fine for it
      if (o.rec && o.rec.scope === rec.scope) return true;
      return true;
    }
    return false;
  };
  const assign = (rec, n) => {
    if (n === rec.final) return;
    ownNames.get(rec.scope).delete(rec.final);
    ownNames.get(rec.scope).set(n, rec);
    for (const o of occOf.get(rec) ?? []) {
      byFinal.get(rec.final)?.delete(o);
      if (!byFinal.has(n)) byFinal.set(n, new Set());
      byFinal.get(n).add(o);
    }
    rec.final = n;
  };
  const sorted = [...wants].sort((a, b) => a.prio - b.prio || a.rec.depth - b.rec.depth || (a.rec.binding.identifier.start ?? 0) - (b.rec.binding.identifier.start ?? 0));
  const done = new Set();
  for (const w of sorted) {
    if (done.has(w.rec)) continue;
    const cands = (Array.isArray(w.names) ? w.names : [w.names]).filter(isValidName);
    if (!cands.length) continue;
    done.add(w.rec);
    let chosen = null;
    for (const c of cands) if (c === w.rec.final || !conflicts(w.rec, c)) { chosen = c; break; }
    if (!chosen) {
      const base = cands[0];
      for (let i = 2; i < 1000 && !chosen; i++) {
        const c = /\d$/.test(base) ? `${base}_${i}` : `${base}${i}`;
        if (!conflicts(w.rec, c)) chosen = c;
      }
    }
    if (chosen) assign(w.rec, chosen);
  }
}

/** Write the final names into the AST and verify that nothing resolves differently. */
export function apply(ast, collected) {
  const { occurrences } = collected;
  const before = new Map();
  for (const o of occurrences) before.set(o.node, o.rec ? o.rec.binding.identifier : `global:${o.name}`);
  for (const o of occurrences) {
    if (!o.rec || o.rec.final === o.node.name) continue;
    const parent = o.path.parentPath;
    if (parent.isObjectProperty() && parent.node.shorthand && parent.node.value === o.node) parent.node.shorthand = false;
    if (parent.isAssignmentPattern() && parent.parentPath.isObjectProperty() && parent.parentPath.node.shorthand) parent.parentPath.node.shorthand = false;
    if (parent.isExportSpecifier() && parent.node.local === o.node && parent.node.exported === o.node) parent.node.exported = t.identifier(o.node.name);
    o.node.name = o.rec.final;
  }
  // verify
  const problems = [];
  const decls = new Set();
  traverse(ast, {
    Scopable: {
      enter(path) {
        for (const b of Object.values(path.scope.bindings)) decls.add(b.identifier);
      },
    },
    Identifier(path) {
      if (!before.has(path.node)) return;
      const binding = decls.has(path.node) ? null : path.scope.getBinding(path.node.name);
      const now = decls.has(path.node) ? path.node : binding ? binding.identifier : `global:${path.node.name}`;
      if (now !== before.get(path.node)) {
        const was = before.get(path.node);
        const wasRec = typeof was === 'string' ? was : collected.byIdent.get(was);
        const nowRec = typeof now === 'string' ? now : collected.byIdent.get(now);
        const desc = (r) => (typeof r === 'string' ? r : r ? `${r.name}→${r.final}#${r.id}(${r.binding.kind})` : '?');
        problems.push(`${path.node.name} @${path.node.start}: was ${desc(wasRec)} now ${desc(nowRec)}`);
      }
    },
  });
  if (problems.length) throw new Error(`rename changed resolution of ${problems.length} identifiers: ${problems.slice(0, 10).join(', ')}`);
}

/** Re-enable `{ a: a }` → `{ a }` shorthand where the names now agree. */
export function shorthand(ast) {
  traverse(ast, {
    ObjectProperty(path) {
      const { node } = path;
      if (node.computed || node.shorthand) return;
      if (t.isIdentifier(node.key) && t.isIdentifier(node.value) && node.key.name === node.value.name) node.shorthand = true;
      if (t.isIdentifier(node.key) && t.isAssignmentPattern(node.value) && t.isIdentifier(node.value.left) && node.value.left.name === node.key.name && path.parentPath.isObjectPattern()) node.shorthand = true;
    },
  });
}
