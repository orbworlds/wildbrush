#!/usr/bin/env node
// Static server for playing the world locally (no build step: the modules run as they are).
//
//   node tools/serve.mjs                  → http://127.0.0.1:8000/ serves this world
//   node tools/serve.mjs 8001:.original 8002:.   several roots, e.g. the original next to it
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const world = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
const roots = process.argv.slice(2).length ? process.argv.slice(2) : ['8000:.'];

for (const spec of roots) {
  const [port, dir] = spec.split(':');
  const root = path.resolve(world, dir);
  http
    .createServer((req, res) => {
      let file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!file.startsWith(root)) return res.writeHead(403).end();
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!fs.existsSync(file)) return res.writeHead(404).end('not found');
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'access-control-allow-origin': '*', 'cache-control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    })
    .listen(Number(port), '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/ → ${path.relative(process.cwd(), root) || '.'}`));
}
