#!/usr/bin/env node
/**
 * بررسی سازگاری ایستای پروژه:
 *  1) همهٔ importهای نسبی به فایل موجود اشاره کنند
 *  2) هر #id که در کد استفاده شده، در index.html یا در قالب‌ها تعریف شده باشد
 *  3) فایل‌های ارجاع‌شده در index.html وجود داشته باشند
 *  4) روتر برای همهٔ مسیرها پاسخ بدهد
 *
 *   node scripts/lint-html.mjs
 */

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { href, parseHash } from '../assets/js/router.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const notes = [];

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(js|mjs)$/.test(entry.name)) yield full;
  }
}

const jsFiles = [];
for await (const f of walk(path.join(ROOT, 'assets', 'js'))) jsFiles.push(f);
for await (const f of walk(path.join(ROOT, 'scripts'))) jsFiles.push(f);

/* ۱) importهای نسبی */
let importCount = 0;
for (const file of jsFiles) {
  const src = await readFile(file, 'utf8');
  const re = /(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src))) {
    importCount++;
    const target = path.resolve(path.dirname(file), m[1]);
    if (!existsSync(target)) problems.push(`${path.relative(ROOT, file)} → import ناموجود: ${m[1]}`);
  }
}
notes.push(`${importCount} import نسبی بررسی شد`);

/* ۲) شناسه‌های DOM */
const html = await readFile(path.join(ROOT, 'index.html'), 'utf8');
const allJs = jsFiles.map((f) => ({ f, src: null }));
let combinedJs = '';
for (const file of jsFiles) combinedJs += await readFile(file, 'utf8');

const htmlIds = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const templateIds = new Set([...combinedJs.matchAll(/id="([^"$]+)"/g)].map((m) => m[1]));
const usedIds = new Set([...combinedJs.matchAll(/\$\(['"]#([A-Za-z][\w-]*)['"]\)/g)].map((m) => m[1]));
for (const m of combinedJs.matchAll(/getElementById\(\s*['"]([\w-]+)['"]/g)) usedIds.add(m[1]);

for (const id of usedIds) {
  if (!htmlIds.has(id) && !templateIds.has(id)) problems.push(`شناسهٔ #${id} در کد استفاده شده ولی در index.html یا قالب‌ها تعریف نشده`);
}
notes.push(`${usedIds.size} شناسهٔ DOM بررسی شد (${htmlIds.size} در HTML)`);

/* ۳) فایل‌های ارجاع‌شده در index.html */
for (const m of html.matchAll(/(?:src|href)="((?!https?:|#|data:)[^"]+)"/g)) {
  const file = path.join(ROOT, m[1]);
  if (!existsSync(file)) problems.push(`index.html → فایل ناموجود: ${m[1]}`);
}

/* ۴) روتر */
const routes = ['home', 'post', 'agency', 'price', 'prices', 'search', 'reels', 'archive', 'settings', 'me'];
for (const name of routes) {
  const h = href(name, { id: 'x', handle: 'y', key: 'z' }, { q: 'test' });
  const parsed = parseHash(h);
  if (parsed.name !== name) problems.push(`روتر: ${name} → ${parsed.name}`);
}
notes.push(`${routes.length} مسیر روتر بررسی شد`);

/* ۵) مسیرهای ناوبری پایین */
for (const m of html.matchAll(/data-route="([\w-]+)"/g)) {
  if (!routes.includes(m[1])) problems.push(`index.html → مسیر ناوبری ناشناخته: ${m[1]}`);
}

console.log('[lint] ' + notes.join(' | '));
if (problems.length) {
  console.error(`[lint] ${problems.length} مشکل:`);
  problems.forEach((p) => console.error('  ✗ ' + p));
  process.exitCode = 1;
} else {
  console.log('[lint] همهٔ بررسی‌ها موفق ✓');
}
