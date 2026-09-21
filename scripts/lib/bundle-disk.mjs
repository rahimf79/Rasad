/**
 * ساخت «بستهٔ آماده» (data/latest.json) از روی فایل‌های پوشهٔ data/.
 * هم collect.mjs و هم seed.mjs از همین استفاده می‌کنند تا خروجی همیشه یکسان باشد.
 */

import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { buildBundle, BUNDLE_LIMITS } from '../../assets/js/lib/bundle.js';
import { APP } from '../../assets/js/config.js';

const readJson = async (file, fallback) => {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
};

/** فایل‌های اخبار (جدیدترین اول) */
export async function listNewsFiles(newsDir) {
  if (!existsSync(newsDir)) return [];
  return (await readdir(newsDir)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse();
}

/** پست‌های چند روز اخیر از آرشیو دیسک */
export async function readRecentPosts(newsDir, { maxFiles = 14, limit = BUNDLE_LIMITS.posts * 2 } = {}) {
  const files = await listNewsFiles(newsDir);
  const out = [];
  for (const f of files.slice(0, maxFiles)) {
    const rows = await readJson(path.join(newsDir, f), []);
    if (Array.isArray(rows)) out.push(...rows);
    if (out.length >= limit) break;
  }
  return out;
}

/** همهٔ سری‌های قیمت: {key: series[]} */
export async function readAllSeries(priceDir) {
  const out = {};
  if (!existsSync(priceDir)) return out;
  for (const f of (await readdir(priceDir)).filter((x) => x.endsWith('.json'))) {
    const rec = await readJson(path.join(priceDir, f), null);
    const key = f.replace('.json', '');
    if (rec && Array.isArray(rec.series)) out[key] = rec.series;
  }
  return out;
}

export async function readCars(dataDir) {
  const rec = await readJson(path.join(dataDir, 'cars.json'), { rows: [] });
  return Array.isArray(rec.rows) ? rec.rows : [];
}

/**
 * ساخت و نوشتن data/latest.json
 * @returns {object} بستهٔ ساخته‌شده
 */
export async function writeLatestBundle({ dataDir, snapshots = [], sources = [], now = Date.now(), dry = false, log = () => {} }) {
  const newsDir = path.join(dataDir, 'news');
  const priceDir = path.join(dataDir, 'prices');
  const [posts, series, cars] = await Promise.all([readRecentPosts(newsDir), readAllSeries(priceDir), readCars(dataDir)]);

  // اگر گزارش منابع این اجرا خالی است (مثلاً --prices-only)، از بستهٔ قبلی استفاده کن تا وضعیت منابع گم نشود
  let src = sources;
  if (!src.length) {
    const prev = await readJson(path.join(dataDir, APP.BUNDLE_FILE), null);
    if (Array.isArray(prev?.sources)) src = prev.sources;
  }

  const bundle = buildBundle({ posts, snapshots, series, cars, sources: src, now });
  const file = path.join(dataDir, APP.BUNDLE_FILE);
  if (dry) {
    log(`(dry) write ${path.basename(file)} — ${bundle.counts.posts} پست، ${bundle.counts.assets} دارایی`);
  } else {
    await mkdir(dataDir, { recursive: true });
    // فشرده (بدون تورفتگی) چون این فایل در هر بازدید دانلود می‌شود
    await writeFile(file, JSON.stringify(bundle), 'utf8');
    const kb = Math.round(Buffer.byteLength(JSON.stringify(bundle), 'utf8') / 1024);
    log(`data/${APP.BUNDLE_FILE} → ${bundle.counts.posts} پست، ${bundle.counts.assets} دارایی (${bundle.counts.freshAssets} تازه)، ${bundle.counts.cars} خودرو — ${kb}KB`);
  }
  return bundle;
}
