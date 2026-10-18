// Semantics-preserving rewrites that undo what the minifier did to the syntax: `!0`/`void 0`,
// comma sequences, `&&`/`||`/`?:` used as statements, merged declarations, `var` for const,
// folded numbers. Identifiers are left alone (see names.mjs).
import * as t from '@babel/types';
import { traverse } from './babel.mjs';

const STATEMENT_LISTS = new Set(['body', 'consequent']);

function inStatementList(path) {
  return Array.isArray(path.container) && STATEMENT_LISTS.has(path.listKey ?? path.parentKey) &&
    (path.parentPath.isProgram() || path.parentPath.isBlockStatement() || path.parentPath.isSwitchCase() || path.parentPath.isStaticBlock());
}

function block(stmts) {
  return stmts.length === 1 && !t.isVariableDeclaration(stmts[0]) && !t.isFunctionDeclaration(stmts[0]) && !t.isClassDeclaration(stmts[0])
    ? stmts[0]
    : t.blockStatement(stmts);
}

/** Replace a statement by several, wrapping them in a block where only one statement fits. */
function replaceStatement(path, stmts) {
  if (stmts.length === 1) path.replaceWith(stmts[0]);
  else if (inStatementList(path)) path.replaceWithMultiple(stmts);
  else path.replaceWith(t.blockStatement(stmts));
}

const FLIP = { '===': '!==', '!==': '===', '==': '!=', '!=': '==' };
export function negate(e) {
  if (t.isUnaryExpression(e, { operator: '!' })) return e.argument;
  if (t.isBinaryExpression(e) && FLIP[e.operator]) return t.binaryExpression(FLIP[e.operator], e.left, e.right);
  return t.unaryExpression('!', e);
}

/** Statements that evaluate `e` for its effects only. */
export function toStatements(e) {
  if (t.isSequenceExpression(e)) return e.expressions.flatMap(toStatements);
  if (t.isLogicalExpression(e) && (e.operator === '&&' || e.operator === '||')) {
    return [t.ifStatement(e.operator === '&&' ? e.left : negate(e.left), block(toStatements(e.right)))];
  }
  if (t.isConditionalExpression(e)) {
    const alt = toStatements(e.alternate);
    return [t.ifStatement(e.test, block(toStatements(e.consequent)), alt.length === 1 && t.isIfStatement(alt[0]) ? alt[0] : block(alt))];
  }
  return [t.expressionStatement(e)];
}

function isSeq(n) {
  return t.isSequenceExpression(n);
}

export function unminify(ast) {
  // Pass 1: expressions → statements, until nothing changes.
  for (let pass = 0; pass < 25; pass++) {
    let changed = 0;
    traverse(ast, {
      UnaryExpression(path) {
        const { node } = path;
        if (node.operator === '!' && t.isNumericLiteral(node.argument) && (node.argument.value === 0 || node.argument.value === 1)) {
          path.replaceWith(t.booleanLiteral(node.argument.value === 0));
          changed++;
        } else if (node.operator === 'void' && t.isNumericLiteral(node.argument, { value: 0 }) && !path.scope.hasBinding('undefined', true)) {
          path.replaceWith(t.identifier('undefined'));
          changed++;
        }
      },
      BinaryExpression(path) {
        const { node } = path;
        // typeof x > "u"  →  typeof x === "undefined"
        const isU = (n) => (t.isStringLiteral(n) && n.value === 'u') || (t.isTemplateLiteral(n) && n.expressions.length === 0 && n.quasis[0].value.cooked === 'u');
        if ((node.operator === '>' || node.operator === '<') && t.isUnaryExpression(node.left, { operator: 'typeof' }) && isU(node.right)) {
          path.replaceWith(t.binaryExpression(node.operator === '>' ? '===' : '!==', node.left, t.stringLiteral('undefined')));
          changed++;
          return;
        }
        // 1/0 → Infinity
        if (node.operator === '/' && t.isNumericLiteral(node.right, { value: 0 })) {
          if (t.isNumericLiteral(node.left, { value: 1 }) && !path.scope.hasBinding('Infinity', true)) {
            path.replaceWith(t.identifier('Infinity'));
            changed++;
          } else if (t.isUnaryExpression(node.left, { operator: '-' }) && t.isNumericLiteral(node.left.argument, { value: 1 }) && !path.scope.hasBinding('Infinity', true)) {
            path.replaceWith(t.unaryExpression('-', t.identifier('Infinity')));
            changed++;
          }
        }
      },
      ExpressionStatement(path) {
        const e = path.node.expression;
        if (isSeq(e) || (t.isLogicalExpression(e) && (e.operator === '&&' || e.operator === '||')) || t.isConditionalExpression(e)) {
          replaceStatement(path, toStatements(e));
          changed++;
        }
      },
      ReturnStatement(path) {
        const a = path.node.argument;
        if (isSeq(a)) {
          const ex = a.expressions;
          replaceStatement(path, [...ex.slice(0, -1).flatMap(toStatements), t.returnStatement(ex[ex.length - 1])]);
          changed++;
        } else if (t.isConditionalExpression(a) && (isSeq(a.consequent) || isSeq(a.alternate)) && inStatementList(path)) {
          const branch = (e) => (isSeq(e) ? [...e.expressions.slice(0, -1).flatMap(toStatements), t.returnStatement(e.expressions[e.expressions.length - 1])] : [t.returnStatement(e)]);
          path.replaceWith(t.ifStatement(a.test, t.blockStatement(branch(a.consequent)), t.blockStatement(branch(a.alternate))));
          changed++;
        }
      },
      ThrowStatement(path) {
        const a = path.node.argument;
        if (isSeq(a)) {
          const ex = a.expressions;
          replaceStatement(path, [...ex.slice(0, -1).flatMap(toStatements), t.throwStatement(ex[ex.length - 1])]);
          changed++;
        }
      },
      // (new nodes rather than the visited one: Babel skips a removed path's node when reinserted)
      IfStatement(path) {
        const { test, consequent, alternate } = path.node;
        if (isSeq(test)) {
          const ex = test.expressions;
          replaceStatement(path, [...ex.slice(0, -1).flatMap(toStatements), t.ifStatement(ex[ex.length - 1], consequent, alternate)]);
          changed++;
        }
      },
      SwitchStatement(path) {
        const { discriminant: d, cases } = path.node;
        if (isSeq(d)) {
          const ex = d.expressions;
          replaceStatement(path, [...ex.slice(0, -1).flatMap(toStatements), t.switchStatement(ex[ex.length - 1], cases)]);
          changed++;
        }
      },
      VariableDeclaration(path) {
        const { node } = path;
        if (path.parentPath.isForStatement() || path.parentPath.isForXStatement()) return;
        if (!inStatementList(path) && !path.parentPath.isExportNamedDeclaration()) return;
        if (path.parentPath.isExportNamedDeclaration()) return;
        if (node.declarations.length > 1) {
          path.replaceWithMultiple(node.declarations.map((d) => t.variableDeclaration(node.kind, [d])));
          changed++;
          return;
        }
        const d = node.declarations[0];
        if (d && isSeq(d.init)) {
          const ex = d.init.expressions;
          const decl = t.variableDeclaration(node.kind, [t.variableDeclarator(d.id, ex[ex.length - 1])]);
          decl.start = node.start;
          decl.declarations[0].start = d.start;
          path.replaceWithMultiple([...ex.slice(0, -1).flatMap(toStatements), decl]);
          changed++;
        }
      },
      ArrowFunctionExpression(path) {
        const b = path.node.body;
        if (isSeq(b)) {
          const ex = b.expressions;
          path.node.body = t.blockStatement([...ex.slice(0, -1).flatMap(toStatements), t.returnStatement(ex[ex.length - 1])]);
          changed++;
        }
      },
      'ForStatement|WhileStatement|DoWhileStatement|ForInStatement|ForOfStatement'(path) {
        const b = path.node.body;
        if (t.isExpressionStatement(b) && (isSeq(b.expression) || t.isLogicalExpression(b.expression) || t.isConditionalExpression(b.expression))) {
          path.node.body = block(toStatements(b.expression));
          changed++;
        }
      },
      TemplateLiteral(path) {
        const { node } = path;
        if (node.expressions.length === 0 && !path.parentPath.isTaggedTemplateExpression()) {
          const v = node.quasis[0].value.cooked;
          if (v != null && !v.includes('\n')) {
            path.replaceWith(t.stringLiteral(v));
            changed++;
          }
        }
      },
    });
    if (!changed) break;
  }
  return ast;
}

/** `let` → `const` where never reassigned; top-level `var` → `const`/`let`. Run on a fresh scope. */
export function constify(ast) {
  traverse(ast, {
    VariableDeclaration(path) {
      const { node } = path;
      const isTop = path.parentPath.isProgram() || (path.parentPath.isExportNamedDeclaration() && path.parentPath.parentPath.isProgram());
      if (node.kind === 'var' && !isTop) return;
      if (node.kind === 'const') return;
      const inForInit = path.parentPath.isForStatement() && path.key === 'init';
      const inForX = path.parentPath.isForXStatement() && path.key === 'left';
      let allConst = true;
      for (const d of node.declarations) {
        if (!d.init && !inForX) allConst = false;
        const ids = Object.keys(t.getBindingIdentifiers(d.id));
        for (const name of ids) {
          const b = path.scope.getBinding(name);
          if (!b || !b.constant) allConst = false;
          if (b && node.kind === 'var' && isTop) {
            // a reference at top level before the declaration relied on `var` hoisting
            for (const r of b.referencePaths) if (r.node.start != null && d.start != null && r.node.start < d.start && !r.getFunctionParent()) allConst = false;
          }
        }
      }
      if (inForInit && allConst) node.kind = 'const';
      else if (inForInit) node.kind = node.kind === 'var' ? 'var' : 'let';
      else node.kind = allConst ? 'const' : 'let';
    },
  });
  return ast;
}

/** `var X = class Y { … }` → `class X { … }` (Y's references become X); same for functions. */
export function declarationsFromExpressions(ast) {
  traverse(ast, {
    VariableDeclaration(path) {
      if (!path.parentPath.isProgram() && !path.parentPath.isBlockStatement()) return;
      const { node } = path;
      if (node.declarations.length !== 1) return;
      const d = node.declarations[0];
      if (!t.isIdentifier(d.id) || !d.init) return;
      if (t.isClassExpression(d.init)) {
        const cls = d.init;
        const outer = path.scope.getBinding(d.id.name);
        if (!outer || !outer.constant) return;
        if (cls.id) {
          // rename the inner name to the outer one, if nothing inside shadows the outer name
          const clsPath = path.get('declarations.0.init');
          const inner = clsPath.scope.getOwnBinding(cls.id.name);
          if (inner) {
            let ok = true;
            for (const r of inner.referencePaths) {
              for (let s = r.scope; s && s !== clsPath.scope; s = s.parent) if (s.hasOwnBinding(d.id.name)) ok = false;
            }
            if (!ok) return;
            for (const r of inner.referencePaths) r.node.name = d.id.name;
            for (const v of inner.constantViolations) return; // never happens for class names
          }
        }
        const decl = t.classDeclaration(d.id, cls.superClass, cls.body, cls.decorators || []);
        decl.start = node.start;
        path.replaceWith(decl);
      }
    },
  });
  return ast;
}

// ---- numbers and three.js enums ----------------------------------------------------------

const COLOR_KEY = /colou?r|hex|tint|emissive|sheen|specular|wood|metal|gem|stone|bark|leaf|leaves|skin|hair|cloth|trim|glow|rim|fog|sky|ground|ink|fur|robe|cape|scarf|belt|boot|petal|moss|sand|rock|grass|water|foam|flame|ember|smoke|cap|stem|light|dark|shade|base|top|bottom|tip|body|eye|pupil|iris|beak|feather|wing|shell|crystal/i;
const COLOR_CALLEES = new Set(['Color', 'Fog', 'FogExp2', 'HemisphereLight', 'DirectionalLight', 'AmbientLight', 'PointLight', 'SpotLight', 'RectAreaLight']);
const COLOR_METHODS = new Set(['setHex', 'setClearColor', 'getHex']);

export function formatNumber(value, hex) {
  if (hex && Number.isInteger(value) && value >= 0 && value <= 0xffffff) return '0x' + value.toString(16).padStart(6, '0');
  if (Number.isInteger(value) && Math.abs(value) < 1e21) return String(value);
  return String(value);
}

function colorContext(path, resolveName) {
  const p = path.parentPath;
  const v = path.node.value;
  if (!Number.isInteger(v) || v < 0 || v > 0xffffff) return false;
  if (p.isNewExpression() || p.isCallExpression()) {
    const c = p.node.callee;
    const name = t.isIdentifier(c) ? resolveName(c.name, p) : t.isMemberExpression(c) && t.isIdentifier(c.property) ? c.property.name : null;
    // new Color(r, g, b) takes floats; only a single argument is a hex colour
    if (name === 'Color' && p.node.arguments.length !== 1) return false;
    if (name && COLOR_CALLEES.has(name) && p.node.arguments.indexOf(path.node) <= (name === 'HemisphereLight' ? 1 : 0)) return true;
    if (name && COLOR_METHODS.has(name)) return true;
    if (t.isMemberExpression(c) && t.isIdentifier(c.property, { name: 'set' }) && p.node.arguments.length === 1 && v >= 0x100) {
      const obj = c.object;
      const key = t.isMemberExpression(obj) && t.isIdentifier(obj.property) ? obj.property.name : t.isIdentifier(obj) ? obj.name : '';
      if (COLOR_KEY.test(key)) return true;
    }
    return false;
  }
  if (p.isObjectProperty() && p.node.value === path.node && !p.node.computed) {
    const k = p.node.key.name ?? p.node.key.value;
    return typeof k === 'string' && COLOR_KEY.test(k) && v >= 0x1000;
  }
  if (p.isArrayExpression() && p.parentPath.isObjectProperty()) {
    const k = p.parentPath.node.key.name ?? p.parentPath.node.key.value;
    return typeof k === 'string' && COLOR_KEY.test(k) && v >= 0x1000;
  }
  if (p.isAssignmentExpression() && p.node.right === path.node && t.isMemberExpression(p.node.left) && t.isIdentifier(p.node.left.property)) {
    return COLOR_KEY.test(p.node.left.property.name) && v >= 0x1000;
  }
  return false;
}

const ENUMS = {
  toneMapping: { 0: 'NoToneMapping', 1: 'LinearToneMapping', 2: 'ReinhardToneMapping', 3: 'CineonToneMapping', 4: 'ACESFilmicToneMapping', 5: 'CustomToneMapping', 6: 'AgXToneMapping', 7: 'NeutralToneMapping' },
  side: { 0: 'FrontSide', 1: 'BackSide', 2: 'DoubleSide' },
  shadowSide: { 0: 'FrontSide', 1: 'BackSide', 2: 'DoubleSide' },
  blending: { 0: 'NoBlending', 1: 'NormalBlending', 2: 'AdditiveBlending', 3: 'SubtractiveBlending', 4: 'MultiplyBlending', 5: 'CustomBlending' },
  wrapS: { 1000: 'RepeatWrapping', 1001: 'ClampToEdgeWrapping', 1002: 'MirroredRepeatWrapping' },
  wrapT: { 1000: 'RepeatWrapping', 1001: 'ClampToEdgeWrapping', 1002: 'MirroredRepeatWrapping' },
  wrapR: { 1000: 'RepeatWrapping', 1001: 'ClampToEdgeWrapping', 1002: 'MirroredRepeatWrapping' },
  magFilter: { 1003: 'NearestFilter', 1006: 'LinearFilter' },
  minFilter: { 1003: 'NearestFilter', 1004: 'NearestMipmapNearestFilter', 1005: 'NearestMipmapLinearFilter', 1006: 'LinearFilter', 1007: 'LinearMipmapNearestFilter', 1008: 'LinearMipmapLinearFilter' },
  type: { 1009: 'UnsignedByteType', 1010: 'ByteType', 1011: 'ShortType', 1012: 'UnsignedShortType', 1013: 'IntType', 1014: 'UnsignedIntType', 1015: 'FloatType', 1016: 'HalfFloatType' },
  format: { 1021: 'AlphaFormat', 1022: 'RGBFormat', 1023: 'RGBAFormat', 1026: 'DepthFormat', 1027: 'DepthStencilFormat', 1028: 'RedFormat', 1029: 'RedIntegerFormat', 1030: 'RGFormat', 1031: 'RGIntegerFormat', 1033: 'RGBAIntegerFormat' },
  blendEquation: { 100: 'AddEquation', 101: 'SubtractEquation', 102: 'ReverseSubtractEquation', 103: 'MinEquation', 104: 'MaxEquation' },
  blendSrc: { 200: 'ZeroFactor', 201: 'OneFactor', 202: 'SrcColorFactor', 203: 'OneMinusSrcColorFactor', 204: 'SrcAlphaFactor', 205: 'OneMinusSrcAlphaFactor', 206: 'DstAlphaFactor', 207: 'OneMinusDstAlphaFactor', 208: 'DstColorFactor', 209: 'OneMinusDstColorFactor', 210: 'SrcAlphaSaturateFactor' },
  blendDst: { 200: 'ZeroFactor', 201: 'OneFactor', 202: 'SrcColorFactor', 203: 'OneMinusSrcColorFactor', 204: 'SrcAlphaFactor', 205: 'OneMinusSrcAlphaFactor', 206: 'DstAlphaFactor', 207: 'OneMinusDstAlphaFactor', 208: 'DstColorFactor', 209: 'OneMinusDstColorFactor' },
  depthFunc: { 0: 'NeverDepth', 1: 'AlwaysDepth', 2: 'LessDepth', 3: 'LessEqualDepth', 4: 'EqualDepth', 5: 'GreaterEqualDepth', 6: 'GreaterDepth', 7: 'NotEqualDepth' },
  depthPacking: { 3200: 'BasicDepthPacking', 3201: 'RGBADepthPacking' },
  usage: { 35044: 'StaticDrawUsage', 35048: 'DynamicDrawUsage' },
  mapping: { 300: 'UVMapping', 301: 'CubeReflectionMapping', 302: 'CubeRefractionMapping', 303: 'EquirectangularReflectionMapping', 304: 'EquirectangularRefractionMapping', 306: 'CubeUVReflectionMapping' },
  normalMapType: { 0: 'TangentSpaceNormalMap', 1: 'ObjectSpaceNormalMap' },
  anisotropy: null,
};
const SHADOW_TYPES = { 0: 'BasicShadowMap', 1: 'PCFShadowMap', 2: 'PCFSoftShadowMap', 3: 'VSMShadowMap' };
const MATERIAL_KEYS = new Set(['color', 'map', 'transparent', 'opacity', 'depthWrite', 'depthTest', 'vertexColors', 'uniforms', 'vertexShader', 'fragmentShader', 'roughness', 'metalness', 'emissive', 'emissiveIntensity', 'wireframe', 'fog', 'alphaTest', 'toneMapped', 'lights', 'defines', 'flatShading', 'polygonOffset', 'alphaMap', 'normalMap', 'sizeAttenuation', 'dithering', 'premultipliedAlpha', 'colorWrite', 'clipping', 'glslVersion']);
const TEXTURE_KEYS = new Set(['depthBuffer', 'stencilBuffer', 'samples', 'generateMipmaps', 'minFilter', 'magFilter', 'wrapS', 'wrapT', 'colorSpace', 'anisotropy', 'depthTexture', 'internalFormat', 'count', 'resolveDepthBuffer']);
const AMBIGUOUS = { side: MATERIAL_KEYS, shadowSide: MATERIAL_KEYS, blending: MATERIAL_KEYS, type: TEXTURE_KEYS, format: TEXTURE_KEYS };

function enumContextOk(key, path) {
  const p = path.parentPath;
  if (p.isNewExpression() || p.isCallExpression()) return true; // DataTexture args, setUsage
  if (key === 'mapping' || key === 'usage') return p.isAssignmentExpression() && /tex|map|env|attr/i.test(objectName(p.node.left.object));
  const keys = AMBIGUOUS[key];
  if (!keys) return true;
  if (p.isObjectProperty()) {
    const obj = p.parentPath.node;
    return obj.properties.some((q) => q !== p.node && t.isObjectProperty(q) && !q.computed && keys.has(q.key.name ?? q.key.value));
  }
  if (p.isAssignmentExpression()) {
    const name = objectName(p.node.left.object);
    return keys === MATERIAL_KEYS ? /mat/i.test(name) : /tex|target|rt\b|buffer/i.test(name);
  }
  return false;
}

function objectName(n) {
  if (t.isIdentifier(n)) return n.name;
  if (t.isMemberExpression(n) && t.isIdentifier(n.property)) return n.property.name;
  return '';
}
const DATA_TEXTURE_ARGS = { DataTexture: { 3: 'format', 4: 'type', 5: 'mapping', 6: 'wrapS', 7: 'wrapT', 8: 'magFilter', 9: 'minFilter' }, Data3DTexture: {}, DataArrayTexture: {} };

/**
 * Numbers: plain decimal for integers, hex for colours, and three.js enum names where the
 * property makes the meaning certain. `threeName(local)` resolves a local to its three export;
 * `useThree(name)` returns (and imports if needed) the local identifier for a three export.
 */
export function restoreNumbers(ast, { threeName, useThree }) {
  traverse(ast, {
    NumericLiteral(path) {
      const v = path.node.value;
      const p = path.parentPath;
      let key = null;
      if (p.isObjectProperty() && p.node.value === path.node && !p.node.computed) key = p.node.key.name ?? p.node.key.value;
      else if (p.isAssignmentExpression() && p.node.right === path.node && t.isMemberExpression(p.node.left) && t.isIdentifier(p.node.left.property)) {
        key = p.node.left.property.name;
        if (key === 'type' && t.isMemberExpression(p.node.left.object) && t.isIdentifier(p.node.left.object.property, { name: 'shadowMap' })) {
          if (SHADOW_TYPES[v]) return void path.replaceWith(useThree(SHADOW_TYPES[v], path));
        }
      } else if (p.isNewExpression() && t.isIdentifier(p.node.callee)) {
        const cls = threeName(p.node.callee.name, p);
        const idx = p.node.arguments.indexOf(path.node);
        if (cls && DATA_TEXTURE_ARGS[cls]?.[idx]) key = DATA_TEXTURE_ARGS[cls][idx];
      } else if (p.isCallExpression() && t.isMemberExpression(p.node.callee) && t.isIdentifier(p.node.callee.property, { name: 'setUsage' })) key = 'usage';
      if (key && ENUMS[key] && ENUMS[key][v] && enumContextOk(key, path)) {
        path.replaceWith(useThree(ENUMS[key][v], path));
        return;
      }
      const hex = colorContext(path, threeName);
      path.node.extra = { rawValue: v, raw: formatNumber(v, hex) };
    },
  });
}
