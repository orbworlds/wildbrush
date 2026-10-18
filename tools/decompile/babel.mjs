// Babel entry points used by the decompiler.
import { parse as babelParse } from '@babel/parser';
import _traverse from '@babel/traverse';
import _generate from '@babel/generator';

const rawTraverse = _traverse.default ?? _traverse;
const rawGenerate = _generate.default ?? _generate;

export function parse(src, sourceType = 'module') {
  return babelParse(src, { sourceType, plugins: [], errorRecovery: false });
}

/** Traverse with a fresh scope (mutations from earlier passes are always visible). */
export function traverse(ast, visitors) {
  rawTraverse.cache.clear();
  rawTraverse(ast, visitors);
}

export function generate(ast) {
  return rawGenerate(ast, { comments: true, jsescOption: { minimal: true }, retainFunctionParens: true }).code;
}

export { rawTraverse };
