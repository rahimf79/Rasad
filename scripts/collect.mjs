#!/usr/bin/env node
/**
 * جمع‌آوری خودکار رصد — در GitHub Actions (هر ۳۰ دقیقه) اجرا می‌شود و خروجی را در پوشهٔ data/
 * همان مخزن کامیت می‌کند. مخزن گیت نقش «پایگاه داده» را بازی می‌کند و مرورگر کاربر فقط می‌خواند:
 *   - data/latest.json           → «بستهٔ آماده»: هر چیزی که صفحهٔ اول لازم دارد در یک فایل (پست‌های تازه،
 *                                   آخرین قیمت همهٔ دارایی‌ها + اسپارک‌لاین، خودرو، وضعیت منابع)
 *   - data/news/YYYY-MM-DD.json  → آرشیو اخبار با تاریخ دقیق انتشار
 *   - data/prices/<key>.json     → سری زمانی فشرده‌شدهٔ قیمت‌ها (ثروتمندی)
 *   - data/cars.json             → قیمت خودرو (باما)
 *   - data/index.json            → فهرست و وضعیت جمع‌آوری
 *
 * استفاده:
 *   node scripts/collect.mjs                 # همهٔ منابع
 *   node scripts/collect.mjs --news-only
 *   node scripts/collect.mjs --prices-only --cars-only
 *   node scripts/collect.mjs --bundle-only   # فقط بازسازی data/latest.json از فایل‌های موجود
 *   node scripts/collect.mjs --dry           # بدون نوشتن روی دیسک
 */

import { mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AGENCIES, PRICE_ENTITIES, SERVATMANDI, CAR_SOURCES, APP, ENTITY_BY_KEY } from '../assets/js/config.js';
import { parseRss, parseServatmandiSummary, parseBamaPrices, parseServatmandiEntities } from '../assets/js/lib/parsers.js';
import { normalizeItem } from '../assets/js/posts.js';
import { normalizeSnapshot } from '../assets/js/prices.js';
import { formatJalali } from '../assets/js/lib/jalali.js';
import { compactSeries, slimPost } from '../assets/js/lib/bundle.js';
import { fetchText } from './lib/http.mjs';
import { writeLatestBundle, listNewsFiles } from './lib/bundle-disk.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const NEWS_DIR = path.join(DATA, 'news');
const PRICE_DIR = path.join(DATA, 'prices');

const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry');
const BUNDLE_ONLY = args.has('--bundle-only');
const doNews = !BUNDLE_ONLY && (!args.has('--prices-only') && !args.has('--cars-only') || args.has('--news-only'));
const doPrices = !BUNDLE_ONLY && (!args.has('--news-only') && !args.has('--cars-only') || args.has('--prices-only'));
const doCars = !BUNDLE_ONLY && (!args.has('--news-only') && !args.has('--prices-only') || args.has('--cars-only'));
const doDiscover = doPrices && !args.has('--no-discover');

const log = (...a) => console.log('[collect]', ...a);

const readJson = async (file, fallback) => {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
};
const writeJson = async (file, value) => {
  if (DRY) { log(`(dry) write ${path.relative(ROOT, file)}`); return; }
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2), 'utf8');
};

const dayKey = (ts) => new Date(ts).toISOString().slice(0, 10);

/* ------------------------------------------------------------------ */
/* اخبار                                                               */
/* ------------------------------------------------------------------ */

async function collectOneAgency(ag) {
  const errors = [];
  for (const feed of ag.feeds || []) {
    try {
      const xml = await fetchText(feed, { timeout: 25000 });
      const items = parseRss(xml);
      if (items.length) {
        return { items: items.map((it) => normalizeItem(it, ag)), via: feed, errors: [] };
      }
      errors.push(`${feed}: آیتمی پیدا نشد`);
    } catch (e) {
      errors.push(`${feed}: ${e.message}`);
    }
  }
  return { items: [], via: null, errors };
}

async function collectNews() {
  await mkdir(NEWS_DIR, { recursive: true });
  const now = Date.now();
  const report = [];
  const byDay = new Map();
  const concurrency = 4;
  const queue = [...AGENCIES];

  const worker = async () => {
    while (queue.length) {
      const ag = queue.shift();
      const res = await collectOneAgency(ag);
      report.push({ id: ag.id, name: ag.name, count: res.items.length, via: res.via, errors: res.errors });
      for (const post of res.items) {
        const key = dayKey(post.date);
        if (!byDay.has(key)) byDay.set(key, new Map());
        byDay.get(key).set(post.id, post);
      }
      log(`${ag.name}: ${res.items.length} خبر`);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));

  let total = 0;
  for (const [day, map] of byDay) {
    const file = path.join(NEWS_DIR, `${day}.json`);
    const existing = await readJson(file, []);
    const merged = new Map(existing.map((p) => [p.id, p]));
    for (const [id, post] of map) if (!merged.has(id)) merged.set(id, slimPost(post, { contentMax: 4000, descMax: 1000 }) || post);
    const rows = [...merged.values()].sort((a, b) => b.date - a.date);
    await writeJson(file, rows);
    total += rows.length;
    log(`data/news/${day}.json → ${rows.length} خبر (${map.size} جدید)`);
  }

  await pruneNews();
  return { report, total, collectedAt: now };
}

async function pruneNews() {
  const cutoff = Date.now() - APP.RETENTION.newsDays * 864e5;
  const files = existsSync(NEWS_DIR) ? (await readdir(NEWS_DIR)).filter((f) => f.endsWith('.json')) : [];
  let removed = 0;
  for (const f of files) {
    const ts = new Date(f.replace('.json', '')).getTime();
    if (isFinite(ts) && ts < cutoff) {
      if (!DRY) await rm(path.join(NEWS_DIR, f));
      removed++;
    }
  }
  if (removed) log(`${removed} فایل قدیمی آرشیو حذف شد (سیاست ${APP.RETENTION.newsDays} روز)`);
  return removed;
}

/* ------------------------------------------------------------------ */
/* قیمت‌ها از ثروتمندی                                                 */
/* ------------------------------------------------------------------ */

async function collectPrices() {
  await mkdir(PRICE_DIR, { recursive: true });
  const results = [];
  const errors = [];
  const points = {};
  const queue = [...PRICE_ENTITIES];
  const concurrency = 3;

  const worker = async () => {
    while (queue.length) {
      const ent = queue.shift();
      const url = `${SERVATMANDI.base}/Entity/Summary/${ent.code}`;
      try {
        const html = await fetchText(url, { timeout: 20000 });
        const parsed = parseServatmandiSummary(html, ent.code);
        if (!parsed) { errors.push(`${ent.name}: پارس نشد`); continue; }
        const snap = normalizeSnapshot({ ...parsed, key: ent.key });
        if (!snap) { errors.push(`${ent.name}: نگاشت نشد`); continue; }

        const t = parsed.time || Date.now();
        const row = { t, v: snap.last, o: snap.first, h: snap.high, l: snap.low, src: 'ثروتمندی' };
        points[ent.key] = [row];
        if (snap.high && snap.high !== snap.last) points[ent.key].push({ t: t - 3600e3, v: snap.high, src: 'ثروتمندی/سقف روز' });
        if (snap.low && snap.low !== snap.last) points[ent.key].push({ t: t - 7200e3, v: snap.low, src: 'ثروتمندی/کف روز' });
        results.push(snap);
        log(`${ent.name} = ${snap.last} ${snap.unitLabel} (${formatJalali(t)})`);
      } catch (e) {
        errors.push(`${ent.name}: ${e.message}`);
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));

  // نوشتن سری‌ها (فشرده‌شده تا با گذشت ماه‌ها حجم فایل‌ها منفجر نشود)
  for (const [key, pts] of Object.entries(points)) {
    const file = path.join(PRICE_DIR, `${key}.json`);
    const rec = await readJson(file, { key, series: [] });
    const map = new Map((rec.series || []).map((p) => [p.t, p]));
    for (const p of pts) map.set(p.t, p);
    const cutoff = Date.now() - APP.RETENTION.priceDays * 864e5;
    rec.series = compactSeries([...map.values()].filter((p) => p.t >= cutoff));
    const last = results.find((r) => r.key === key);
    rec.meta = {
      key,
      name: last?.name || ENTITY_BY_KEY[key]?.name,
      unit: last?.unit || ENTITY_BY_KEY[key]?.unit,
      source: 'ثروتمندی',
      sourceUrl: `https://servatmandi.com/Entity/Summary/${ENTITY_BY_KEY[key]?.code}`,
      updatedAt: Date.now()
    };
    await writeJson(file, rec);
  }

  return { results, errors, count: Object.keys(points).length };
}

/* ------------------------------------------------------------------ */
/* خودرو از باما                                                       */
/* ------------------------------------------------------------------ */

async function collectCarPrices() {
  const rows = [];
  const errors = [];
  for (const src of CAR_SOURCES) {
    for (const page of src.pages || []) {
      try {
        const html = await fetchText(page, { timeout: 25000 });
        const found = parseBamaPrices(html);
        found.forEach((r) => rows.push({ ...r, source: src.name, page, at: Date.now() }));
        log(`${src.name} ${page}: ${found.length} قیمت`);
      } catch (e) {
        errors.push(`${page}: ${e.message}`);
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  const prev = await readJson(path.join(DATA, 'cars.json'), { rows: [] });
  const byName = new Map((prev.rows || []).map((r) => [r.name, r]));
  for (const r of rows) byName.set(r.name, r);
  await writeJson(path.join(DATA, 'cars.json'), { rows: [...byName.values()], updatedAt: Date.now() });
  return { count: byName.size, errors };
}

/* ------------------------------------------------------------------ */
/* کشف خودکار دارایی‌های جدید ثروتمندی                                  */
/* ------------------------------------------------------------------ */

async function discoverEntities() {
  const found = [];
  for (const cat of SERVATMANDI.categories) {
    try {
      const html = await fetchText(`${SERVATMANDI.base}/Entities/${cat.id}`, { timeout: 20000 });
      const list = parseServatmandiEntities(html).map((e) => ({ ...e, group: cat.key }));
      found.push(...list);
      log(`دستهٔ ${cat.label}: ${list.length} دارایی`);
    } catch (e) {
      log(`دستهٔ ${cat.label} ناموفق: ${e.message}`);
    }
  }
  const known = new Set(PRICE_ENTITIES.map((e) => e.code));
  const fresh = found.filter((e) => !known.has(e.code));
  await writeJson(path.join(DATA, 'entities.json'), { entities: found, discoveredAt: Date.now() });
  return { total: found.length, fresh: fresh.length };
}

/* ------------------------------------------------------------------ */

/** هر مرحله جدا خطاگیری می‌شود تا شکست یک منبع، انتشار بقیهٔ داده‌ها را متوقف نکند */
async function step(name, fn, fallback) {
  try { return await fn(); } catch (e) { console.error(`[collect] مرحلهٔ ${name} ناموفق:`, e.message); return fallback; }
}

async function main() {
  const started = Date.now();
  log(`شروع جمع‌آوری — ${formatJalali(started)}${BUNDLE_ONLY ? ' (فقط بسته)' : ''}`);

  const news = doNews ? await step('اخبار', collectNews, { report: [], total: 0 }) : { report: [], total: 0 };
  const prices = doPrices ? await step('قیمت‌ها', collectPrices, { results: [], errors: ['اجرا نشد'], count: 0 }) : { results: [], errors: [], count: 0 };
  const cars = doCars ? await step('خودرو', collectCarPrices, { count: 0, errors: [] }) : { count: 0, errors: [] };
  const discovery = doDiscover ? await step('کشف دارایی', discoverEntities, { total: 0, fresh: 0 }) : { total: 0, fresh: 0 };

  // بستهٔ آماده — تنها فایلی که مرورگر برای نمایش صفحهٔ اول می‌خواند
  const bundle = await step('بستهٔ آماده', () => writeLatestBundle({
    dataDir: DATA,
    snapshots: prices.results,
    sources: news.report.map((r) => ({ id: r.id, name: r.name, count: r.count, ok: r.count > 0 })),
    dry: DRY,
    log
  }), null);

  const files = await listNewsFiles(NEWS_DIR);
  const index = {
    app: APP.name,
    version: APP.version,
    generatedAt: Date.now(),
    generatedAtJalali: formatJalali(Date.now(), { seconds: true }),
    news: { files, days: files.length },
    prices: {
      assets: (await (async () => (existsSync(PRICE_DIR) ? (await readdir(PRICE_DIR)).filter((f) => f.endsWith('.json')) : []))())
        .map((f) => f.replace('.json', '')),
      collected: prices.count,
      errors: prices.errors.length
    },
    cars: { count: cars.count },
    discovery,
    bundle: bundle ? { file: APP.BUNDLE_FILE, posts: bundle.counts.posts, assets: bundle.counts.assets, generatedAt: bundle.generatedAt } : null,
    intervalMinutes: APP.COLLECT_INTERVAL_MIN,
    sources: news.report.map((r) => ({ id: r.id, name: r.name, count: r.count, ok: r.count > 0 })),
    retention: APP.RETENTION,
    durationMs: Date.now() - started
  };

  if (!BUNDLE_ONLY) await writeJson(path.join(DATA, 'index.json'), index);

  log(`پایان: ${news.report.reduce((a, r) => a + r.count, 0)} خبر، ${prices.count} قیمت، ${cars.count} خودرو در ${index.durationMs}ms`);
  const okSources = news.report.filter((r) => r.count > 0).length;
  if (doNews) log(`منابع خبری موفق: ${okSources}/${news.report.length}`);
  if (doNews && doPrices && !okSources && !prices.count && !DRY) {
    console.warn('[collect] هشدار: هیچ منبعی داده برنگرداند — خروجی قبلی دست‌نخورده باقی می‌ماند.');
  }
}

main().catch((e) => {
  console.error('[collect] خطای غیرمنتظره:', e);
  process.exitCode = 1;
});
