#!/usr/bin/env node
/** سرور استاتیک محلی برای پیش‌نمایش (بدون وابستگی خارجی) — node scripts/serve.mjs */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

const safeJoin = (base, target) => {
  const p = path.normalize(path.join(base, target));
  return p.startsWith(base) ? p : null;
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';

    let file = safeJoin(ROOT, rel);
    if (!file) { res.writeHead(403).end('forbidden'); return; }

    const s = await stat(file).catch(() => null);
    if (s?.isDirectory()) file = path.join(file, 'index.html');

    const body = await readFile(file).catch(() => null);
    if (!body) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 — ' + rel);
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(body);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('500 — ' + e.message);
  }
}).listen(PORT, HOST, () => {
  console.log(`رصد روی http://${HOST}:${PORT} در حال اجراست`);
});
