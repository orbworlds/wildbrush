#!/usr/bin/env node
// Packages the world for Orb: the modules are plain ES modules already, so src/ is copied as it is
// (to the package's root) and index.html points at ./main.js and ./styles/ui.css. The libraries
// come from jsDelivr through the page's import map. scripts/gen-originals.mjs calls this.
//
//   node tools/package.mjs [outDir=out]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(root, process.argv[2] || 'out');
const src = path.join(root, 'src');

fs.rmSync(out, { recursive: true, force: true });
let count = 0, bytes = 0;
(function copy(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) copy(p);
    else {
      const dest = path.join(out, path.relative(src, p));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(p, dest);
      count++;
      bytes += fs.statSync(p).size;
    }
  }
})(src);

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replaceAll('./src/', './');
if (!html.includes('src="./main.js"')) throw new Error('index.html: entry script not found');
fs.writeFileSync(path.join(out, 'index.html'), html);
console.log(`packaged ${count + 1} files (${Math.round(bytes / 1024)} KB) → ${path.relative(process.cwd(), out) || '.'}`);
