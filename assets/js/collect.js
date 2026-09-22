/**
 * دسترسی به داده در مرورگر.
 *
 * مسیر اصلی (پیش‌فرض): خواندن «بستهٔ آماده» data/latest.json که GitHub Actions در فواصل مشخص
 * می‌سازد — یک درخواست، بدون هیچ جمع‌آوری‌ای در سمت کاربر.
 *
 * مسیر جایگزین (فقط با درخواست صریح کاربر از تنظیمات): جمع‌آوری زنده در مرورگر
 * (درخواست مستقیم → پروکسی‌های CORS). همهٔ پارس‌ها از همان ماژول مشترک lib/parsers.js انجام می‌شود.
 */

import { parseRss, parseServatmandiSummary, parseBamaPrices, toNumber } from './lib/parsers.js';
import { normalizeItem } from './posts.js';
import { normalizeSnapshot, rialToToman } from './prices.js';
import { PRICE_ENTITIES, ENTITY_BY_KEY, SERVATMANDI, CAR_SOURCES, AGENCY_BY_ID, APP } from './config.js';
import { stripHtml, sleep } from './lib/util.js';
import { normalizeBundle } from './lib/bundle.js';

const PROXIES = [
  (u) => u,
  (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`,
  (u) => `https://r.jina.ai/${u}`
];

/** دریافت متن با تلاش روی پروکسی‌ها */
export async function fetchText(url, { timeout = 15000, proxies = PROXIES, fetchImpl } = {}) {
  const f = fetchImpl || globalThis.fetch;
  const errors = [];
  for (const make of proxies) {
    const target = make(url);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await f(target, { signal: ctrl.signal, headers: { Accept: '*/*' } });
      clearTimeout(timer);
      if (!res.ok) { errors.push(`${target}: HTTP ${res.status}`); continue; }
      const text = await res.text();
      if (text && text.length > 20) return { text, via: target };
      errors.push(`${target}: پاسخ خالی`);
    } catch (e) {
      clearTimeout(timer);
      errors.push(`${target}: ${e.name || 'error'}`);
    }
  }
  throw new Error(`همهٔ مسیرهای دریافت شکست خورد: ${errors.slice(0, 3).join(' | ')}`);
}

const RSS2JSON = (u) => `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(u)}`;

/**
 * جمع‌آوری اخبار یک خبرگزاری.
 * ابتدا rss2json (بدون مشکل CORS) و سپس RSS خام از راه پروکسی.
 */
export async function collectAgency(agency, { fetchImpl, log = () => {} } = {}) {
  const feeds = agency.feeds?.length ? agency.feeds : [];
  const errors = [];

  for (const feed of feeds) {
    // مسیر ۱: rss2json
    try {
      const { text } = await fetchText(RSS2JSON(feed), { fetchImpl, proxies: [(u) => u] });
      const j = JSON.parse(text);
      if (j?.status === 'ok' && Array.isArray(j.items) && j.items.length) {
        log(`${agency.name}: ${j.items.length} خبر از rss2json`);
        return { items: j.items, feed, via: 'rss2json' };
      }
    } catch (e) { errors.push(`rss2json: ${e.message}`); }

    // مسیر ۲: RSS خام + پارسر داخلی
    try {
      const { text, via } = await fetchText(feed, { fetchImpl });
      const items = parseRss(text);
      if (items.length) {
        log(`${agency.name}: ${items.length} خبر از ${via}`);
        return { items, feed, via };
      }
      errors.push(`${feed}: آیتمی پیدا نشد`);
    } catch (e) { errors.push(`${feed}: ${e.message}`); }
  }

  return { items: [], feed: feeds[0], via: null, errors };
}

/** جمع‌آوری همهٔ خبرگزاری‌ها و تبدیل به پست */
export async function collectNews({ agencies, concurrency = 3, onAgency, log = () => {}, fetchImpl, throttle = 120 } = {}) {
  const posts = [];
  const report = [];
  const now = Date.now();
  const queue = [...agencies];

  const worker = async () => {
    while (queue.length) {
      const ag = queue.shift();
      try {
        const res = await collectAgency(ag, { fetchImpl, log });
        const items = (res.items || []).map((it) => normalizeItem(it, ag, now));
        posts.push(...items);
        report.push({ id: ag.id, name: ag.name, count: items.length, via: res.via, errors: res.errors || [] });
        onAgency?.(ag, items.length);
      } catch (e) {
        report.push({ id: ag.id, name: ag.name, count: 0, errors: [e.message] });
      }
      if (throttle) await sleep(throttle);
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
  return { posts, report, collectedAt: now };
}

/* ------------------------------------------------------------------ */
/* قیمت‌ها از ثروتمندی                                                 */
/* ------------------------------------------------------------------ */

export async function collectServatmandi(keys, { fetchImpl, log = () => {}, onAsset, throttle = 150 } = {}) {
  const list = (keys && keys.length ? keys : PRICE_ENTITIES.map((e) => e.key))
    .map((k) => ENTITY_BY_KEY[k]).filter(Boolean);

  const snapshots = [];
  const errors = [];

  for (const ent of list) {
    const url = `${SERVATMANDI.base}/Entity/Summary/${ent.code}`;
    try {
      const { text, via } = await fetchText(url, { fetchImpl });
      const parsed = parseServatmandiSummary(text, ent.code);
      if (!parsed) { errors.push(`${ent.name}: پارس نشد`); continue; }
      const snap = normalizeSnapshot({ ...parsed, key: ent.key });
      if (!snap) { errors.push(`${ent.name}: نگاشت نشد`); continue; }
      snap.via = via;
      snapshots.push(snap);
      onAsset?.(snap);
      if (throttle) await sleep(throttle);
    } catch (e) {
      errors.push(`${ent.name}: ${e.message}`);
    }
  }
  return { snapshots, errors };
}

/** نقاط قیمتی آمادهٔ ذخیره در آرشیو */
export function snapshotsToPoints(snapshots) {
  const out = {};
  for (const s of snapshots) {
    if (!isFinite(s.last) || !s.last) continue;
    const t = s.time || Date.now();
    out[s.key] = [
      { t, v: s.last, o: s.first, h: s.high, l: s.low, src: 'ثروتمندی' }
    ];
    // نقاط مرزی روز (کمینه/بیشینه) هم ثبت می‌شوند تا نمودار از روز اول معنادار باشد
    if (s.high && s.high !== s.last) out[s.key].push({ t: t - 3600e3, v: s.high, src: 'ثروتمندی (سقف روز)' });
    if (s.low && s.low !== s.last) out[s.key].push({ t: t - 7200e3, v: s.low, src: 'ثروتمندی (کف روز)' });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* خودرو از باما                                                       */
/* ------------------------------------------------------------------ */

export async function collectCars({ sources = CAR_SOURCES, fetchImpl, log = () => {}, throttle = 200 } = {}) {
  const found = [];
  const errors = [];
  for (const src of sources) {
    for (const page of src.pages || []) {
      try {
        const { text } = await fetchText(page, { fetchImpl, timeout: 18000 });
        const rows = parseBamaPrices(text);
        rows.forEach((r) => found.push({ ...r, source: src.name, page, at: Date.now() }));
        log(`${src.name} ${page}: ${rows.length} قیمت`);
      } catch (e) {
        errors.push(`${page}: ${e.message}`);
      }
      if (throttle) await sleep(throttle);
    }
  }
  return { cars: found, errors };
}

/* ------------------------------------------------------------------ */
/* دادهٔ آمادهٔ منتشرشده روی GitHub Pages                               */
/* ------------------------------------------------------------------ */

/**
 * بستهٔ آماده (data/latest.json): تنها درخواستی که برای نمایش صفحهٔ اول لازم است.
 * @returns {object|null} خروجی normalizeBundle یا null اگر هنوز منتشر نشده باشد
 */
export async function loadLatestBundle({ base = 'data', fetchImpl, file = APP.BUNDLE_FILE } = {}) {
  try {
    const f = fetchImpl || globalThis.fetch;
    const res = await f(`${base}/${file}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return normalizeBundle(await res.json());
  } catch { return null; }
}

/** خواندن فهرست آرشیو (data/index.json) */
export async function loadArchiveIndex({ base = 'data', fetchImpl } = {}) {
  try {
    const f = fetchImpl || globalThis.fetch;
    const res = await f(`${base}/index.json`, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

/** خواندن فایل‌های اخبار آرشیوشده (موازی) */
export async function loadArchivedPosts({ base = 'data', files = [], fetchImpl, limit = 8 } = {}) {
  const f = fetchImpl || globalThis.fetch;
  const chunks = await Promise.all(files.slice(0, limit).map(async (file) => {
    try {
      const res = await f(`${base}/news/${file}`, { cache: 'no-store' });
      if (!res.ok) return [];
      const j = await res.json();
      if (Array.isArray(j)) return j;
      if (Array.isArray(j.posts)) return j.posts;
      return [];
    } catch { return []; }
  }));
  return chunks.flat();
}

/** خواندن آرشیو قیمت‌ها (موازی) */
export async function loadArchivedPrices({ base = 'data', keys = [], fetchImpl } = {}) {
  const f = fetchImpl || globalThis.fetch;
  const out = {};
  await Promise.all(keys.map(async (key) => {
    try {
      const res = await f(`${base}/prices/${key}.json`, { cache: 'no-store' });
      if (!res.ok) return;
      const j = await res.json();
      out[key] = Array.isArray(j.series) ? j.series : (Array.isArray(j) ? j : []);
    } catch { /* skip */ }
  }));
  return out;
}

/** خواندن قیمت خودروی آرشیوشده */
export async function loadArchivedCars({ base = 'data', fetchImpl } = {}) {
  try {
    const f = fetchImpl || globalThis.fetch;
    const res = await f(`${base}/cars.json`, { cache: 'no-store' });
    if (!res.ok) return [];
    const j = await res.json();
    return Array.isArray(j.rows) ? j.rows : [];
  } catch { return []; }
}

/** تبدیل ردیف‌های خام قیمت خودرو به دارایی قابل نمایش */
export function carsToAssets(rows, { usdRate = 0 } = {}) {
  const byName = new Map();
  for (const r of rows || []) {
    const prev = byName.get(r.name);
    if (!prev || (r.at || 0) > (prev.at || 0)) byName.set(r.name, r);
  }
  return [...byName.values()].map((r) => ({
    key: `car:${r.name}`,
    code: `car:${r.name}`,
    name: r.name,
    short: 'خودرو',
    group: 'car',
    icon: '🚗',
    unit: 'rial',
    unitLabel: 'تومان',
    last: r.price,
    first: r.price, high: r.price, low: r.price, prev: null,
    change: 0, changePct: 0,
    time: r.at || Date.now(),
    source: r.source || 'باما',
    sourceUrl: r.page || 'https://bama.ir',
    usd: usdRate ? Math.round(r.price / usdRate) : null
  }));
}

export { rialToToman, toNumber, stripHtml, AGENCY_BY_ID };
