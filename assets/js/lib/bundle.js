/**
 * «بستهٔ آماده» (data/latest.json)
 *
 * GitHub Actions در فواصل مشخص اخبار و قیمت‌ها را جمع می‌کند و علاوه بر آرشیو کامل،
 * یک فایل کوچکِ یک‌تکه می‌سازد که همهٔ چیزی است که صفحهٔ اول به آن نیاز دارد:
 * تازه‌ترین پست‌ها، آخرین قیمت همهٔ دارایی‌ها + اسپارک‌لاین، قیمت خودرو و وضعیت منابع.
 * مرورگر فقط همین یک فایل را می‌خواند و بلافاصله رندر می‌کند — هیچ جمع‌آوری‌ای در سمت کاربر انجام نمی‌شود.
 *
 * این ماژول هم در Node (scripts/collect.mjs) و هم در مرورگر استفاده می‌شود؛ پس فقط توابع خالص دارد.
 */

import { PRICE_ENTITIES, APP } from '../config.js';
import { unitLabel } from '../prices.js';
import { formatJalali } from './jalali.js';

export const BUNDLE_VERSION = 1;

export const BUNDLE_LIMITS = {
  posts: 400,        // تازه‌ترین پست‌ها در بسته
  spark: 48,         // نقاط اسپارک‌لاین هر دارایی
  contentMax: 1500,  // حداکثر طول متن کامل هر خبر در بسته/آرشیو
  descMax: 600
};

const DAY = 864e5;
const HOUR = 3600e3;

/** پست سبک‌شده برای بسته و آرشیو (فیلدهای نمایشی حفظ می‌شوند، متن بلند کوتاه می‌شود) */
export function slimPost(p, limits = BUNDLE_LIMITS) {
  if (!p || !p.id) return null;
  const desc = String(p.desc || '').slice(0, limits.descMax);
  const content = String(p.content || '');
  return {
    id: p.id,
    title: String(p.title || '').slice(0, 400),
    desc,
    content: content.length > limits.contentMax ? content.slice(0, limits.contentMax) + '…' : content,
    link: p.link || '',
    sourceId: p.sourceId,
    sourceName: p.sourceName,
    sourceFull: p.sourceFull,
    sourceHandle: p.sourceHandle,
    sourceColor: p.sourceColor,
    date: +p.date || 0,
    exactDate: p.exactDate,
    exactDateShort: p.exactDateShort,
    collectedAt: p.collectedAt,
    img: p.img || '',
    topic: p.topic,
    hashtags: Array.isArray(p.hashtags) ? p.hashtags.slice(0, 3) : []
  };
}

/**
 * فشرده‌سازی سری زمانی تا فایل‌ها با گذشت ماه‌ها منفجر نشوند:
 *   ≤ ۲ روز: همهٔ نقاط · ≤ ۳۰ روز: هر ساعت یک نقطه · ≤ ۱ سال: هر ۶ ساعت · قدیمی‌تر: روزی یک نقطه.
 * در هر سطل آخرین نقطه نگه داشته می‌شود؛ آخرین نقطهٔ سری همیشه حفظ می‌شود.
 */
export function compactSeries(series, now = Date.now()) {
  const list = (series || []).filter((p) => p && isFinite(p.t) && isFinite(p.v)).sort((a, b) => a.t - b.t);
  if (list.length < 3) return list;
  const bucketFor = (t) => {
    const age = now - t;
    if (age <= 2 * DAY) return 0;
    if (age <= 30 * DAY) return HOUR;
    if (age <= 365 * DAY) return 6 * HOUR;
    return DAY;
  };
  const out = new Map();
  for (const p of list) {
    const b = bucketFor(p.t);
    const key = b ? `${b}:${Math.floor(p.t / b)}` : `raw:${p.t}`;
    out.set(key, p); // آخرین نقطهٔ سطل برنده است
  }
  const result = [...out.values()].sort((a, b) => a.t - b.t);
  const last = list[list.length - 1];
  if (result[result.length - 1]?.t !== last.t) result.push(last);
  return result;
}

/** اسپارک‌لاین: آخرین n نقطه (فقط زمان و مقدار) */
export function sparkOf(series, n = BUNDLE_LIMITS.spark) {
  const list = (series || []).filter((p) => p && isFinite(p.t) && isFinite(p.v)).sort((a, b) => a.t - b.t);
  return list.slice(-n).map((p) => ({ t: p.t, v: p.v }));
}

/**
 * وقتی در این اجرا دارایی دریافت نشده، از آرشیو سری زمانی یک اسنپ‌شات قابل نمایش می‌سازیم
 * تا فهرست بازار همیشه کامل باشد.
 */
export function assetFromSeries(ent, series) {
  const list = (series || []).filter((p) => p && isFinite(p.t) && isFinite(p.v)).sort((a, b) => a.t - b.t);
  if (!ent || !list.length) return null;
  const last = list[list.length - 1];
  const dayAgo = last.t - DAY;
  const older = [...list].reverse().find((p) => p.t <= dayAgo) || list[0];
  const window = list.filter((p) => p.t > dayAgo);
  const values = (window.length ? window : [last]).map((p) => p.v);
  const base = older.v || last.v;
  const change = last.v - base;
  return {
    key: ent.key,
    code: ent.code,
    name: ent.name,
    short: ent.short,
    group: ent.group,
    icon: ent.icon,
    featured: !!ent.featured,
    unit: ent.unit,
    unitLabel: unitLabel(ent.unit),
    last: last.v,
    first: (window[0] || last).v,
    high: Math.max(...values),
    low: Math.min(...values),
    prev: base,
    change,
    changePct: base ? (change / base) * 100 : 0,
    time: last.t,
    source: 'ثروتمندی',
    sourceUrl: `https://servatmandi.com/Entity/Summary/${ent.code}`,
    stale: true
  };
}

/**
 * ساخت بستهٔ آماده.
 * @param {object} o
 * @param {Array}  o.posts       همهٔ پست‌های اخیر (مرتب می‌شوند و به حد مجاز بریده می‌شوند)
 * @param {Array}  o.snapshots   اسنپ‌شات‌های نرمال‌شدهٔ همین اجرا (normalizeSnapshot)
 * @param {object} o.series      {key: [{t,v,...}]} سری کامل هر دارایی
 * @param {Array}  o.cars        ردیف‌های قیمت خودرو
 * @param {Array}  o.sources     گزارش منابع خبری
 */
export function buildBundle({ posts = [], snapshots = [], series = {}, cars = [], sources = [], now = Date.now(), intervalMinutes = APP.COLLECT_INTERVAL_MIN, limits = BUNDLE_LIMITS } = {}) {
  const seen = new Set();
  const slimPosts = [];
  for (const p of [...posts].sort((a, b) => (b.date || 0) - (a.date || 0))) {
    if (!p?.id || seen.has(p.id)) continue;
    seen.add(p.id);
    const s = slimPost(p, limits);
    if (s) slimPosts.push(s);
    if (slimPosts.length >= limits.posts) break;
  }

  const snapByKey = new Map(snapshots.filter(Boolean).map((s) => [s.key, s]));
  const assets = [];
  for (const ent of PRICE_ENTITIES) {
    const fresh = snapByKey.get(ent.key);
    const asset = fresh ? { ...fresh, featured: !!ent.featured, stale: false } : assetFromSeries(ent, series[ent.key]);
    if (!asset) continue;
    asset.spark = sparkOf(series[ent.key] || [], limits.spark);
    if (!asset.spark.length && isFinite(asset.last)) asset.spark = [{ t: asset.time || now, v: asset.last }];
    assets.push(asset);
  }

  const bySource = new Map();
  for (const p of slimPosts) bySource.set(p.sourceId, (bySource.get(p.sourceId) || 0) + 1);

  return {
    version: BUNDLE_VERSION,
    app: APP.name,
    generatedAt: now,
    generatedAtJalali: formatJalali(now, { seconds: true }),
    intervalMinutes,
    nextRunAt: now + intervalMinutes * 60e3,
    counts: {
      posts: slimPosts.length,
      assets: assets.length,
      freshAssets: assets.filter((a) => !a.stale).length,
      cars: cars.length,
      sourcesOk: sources.filter((s) => s.ok || s.count > 0).length,
      sources: sources.length
    },
    sources: sources.map((s) => ({ id: s.id, name: s.name, count: s.count || 0, ok: !!(s.ok || s.count > 0), posts: bySource.get(s.id) || 0 })),
    posts: slimPosts,
    assets,
    cars: cars.map((r) => ({ name: r.name, price: r.price, source: r.source, page: r.page, at: r.at })).filter((r) => r.name && isFinite(r.price))
  };
}

/** اعتبارسنجی بستهٔ خوانده‌شده در مرورگر؛ در صورت نامعتبر بودن null */
export function normalizeBundle(json) {
  if (!json || typeof json !== 'object') return null;
  if (!Array.isArray(json.posts) || !Array.isArray(json.assets)) return null;
  const posts = json.posts.filter((p) => p && p.id && p.title && isFinite(p.date));
  const assets = json.assets.filter((a) => a && a.key && isFinite(a.last)).map((a) => ({
    ...a,
    spark: Array.isArray(a.spark) ? a.spark.filter((p) => p && isFinite(p.t) && isFinite(p.v)) : []
  }));
  return {
    version: json.version || 0,
    generatedAt: +json.generatedAt || 0,
    generatedAtJalali: json.generatedAtJalali || '',
    intervalMinutes: +json.intervalMinutes || APP.COLLECT_INTERVAL_MIN,
    nextRunAt: +json.nextRunAt || 0,
    counts: json.counts || {},
    sources: Array.isArray(json.sources) ? json.sources : [],
    posts,
    assets,
    cars: Array.isArray(json.cars) ? json.cars : []
  };
}
