#!/usr/bin/env node
/**
 * دادهٔ نمایشی برای پیش‌نمایش محلی (بدون اینترنت).
 * یک data/latest.json با پست‌ها و قیمت‌های ساختگی ولی واقع‌نما می‌سازد تا بتوان رابط را دید.
 *
 *   node scripts/demo-data.mjs          # می‌نویسد روی data/latest.json (فقط برای توسعه!)
 *   node scripts/collect.mjs --bundle-only   # برگرداندن بستهٔ واقعی از روی آرشیو
 *
 * هشدار: این فایل را کامیت نکنید؛ GitHub Actions در اجرای بعدی آن را با دادهٔ واقعی جایگزین می‌کند.
 */

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AGENCIES, PRICE_ENTITIES, APP } from '../assets/js/config.js';
import { normalizeItem } from '../assets/js/posts.js';
import { normalizeSnapshot } from '../assets/js/prices.js';
import { buildBundle } from '../assets/js/lib/bundle.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const now = Date.now();

const HEADLINES = [
  ['قیمت دلار در بازار آزاد امروز به کانال جدیدی وارد شد', 'اقتصاد'],
  ['افزایش قیمت طلا و سکه در پی رشد انس جهانی', 'اقتصاد'],
  ['وزیر نفت: صادرات نفت ایران به بالاترین سطح پنج سال اخیر رسید', 'انرژی'],
  ['تیم ملی فوتبال ایران با پیروزی راهی مرحلهٔ بعد شد', 'ورزش'],
  ['هوش مصنوعی در خدمات بانکی؛ آغاز طرح آزمایشی در سه بانک', 'فناوری'],
  ['قیمت خودروهای داخلی در هفتهٔ گذشته ثابت ماند', 'خودرو'],
  ['مذاکرات منطقه‌ای برای کاهش تنش‌ها ادامه دارد', 'سیاست'],
  ['وزارت بهداشت: واکسیناسیون فصلی از هفتهٔ آینده آغاز می‌شود', 'سلامت'],
  ['بازار مسکن تهران در انتظار تصمیم جدید شورای پول و اعتبار', 'اقتصاد'],
  ['قطعی گاز صنایع سیمان با سرد شدن هوا آغاز شد', 'انرژی'],
  ['رونمایی از نسل جدید اینترنت ماهواره‌ای در نمایشگاه تهران', 'فناوری'],
  ['بارش برف و باران در ۱۸ استان کشور طی ۴۸ ساعت آینده', 'ایران'],
  ['بورس تهران در پایان معاملات امروز سبزپوش شد', 'اقتصاد'],
  ['افتتاح فاز جدید پالایشگاه ستارهٔ خلیج فارس', 'انرژی'],
  ['قهرمانی کشتی‌گیران ایران در رقابت‌های جهانی', 'ورزش'],
  ['نرخ تورم نقطه‌به‌نقطه شهریور اعلام شد', 'اقتصاد']
];

const IMAGES = [
  'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=900&q=70',
  'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=900&q=70',
  'https://images.unsplash.com/photo-1518186285589-2f7649de83e0?w=900&q=70',
  '',
  'https://images.unsplash.com/photo-1549421263-5ec394a5ad4c?w=900&q=70',
  '',
  'https://images.unsplash.com/photo-1495020689067-958852a7765e?w=900&q=70',
  ''
];

const posts = [];
let n = 0;
for (const ag of AGENCIES.slice(0, 12)) {
  for (let i = 0; i < 4; i++) {
    const [title, topic] = HEADLINES[(n + i) % HEADLINES.length];
    const ageMin = 8 + n * 11 + i * 95;
    posts.push(normalizeItem({
      title: `${title}`,
      description: `${ag.name} گزارش می‌دهد: ${title}. جزئیات بیشتر در ادامهٔ خبر آمده است و کارشناسان دربارهٔ پیامدهای آن اظهار نظر کرده‌اند.`,
      content: `<p>${title}. این خبر برای پیش‌نمایش رابط ساخته شده و واقعی نیست.</p>`,
      link: `${ag.site.replace(/\/$/, '')}/news/demo-${n}-${i}`,
      pubDate: new Date(now - ageMin * 60e3).toUTCString(),
      thumbnail: IMAGES[(n + i) % IMAGES.length],
      categories: [topic]
    }, ag, now));
    n++;
  }
}

const BASE = { usd: 2315000, eur: 2705000, gbp: 3110000, aed: 630500, try: 56000, cny: 322000, gold18: 243727463, gold24: 324969950, gold_ounce: 4383.45, coin_emami: 2470000000, coin_bahar: 2350000000, coin_half: 1300000000, coin_quarter: 720000000, coin_gram: 380000000, oil_brent: 67.4, oil_wti: 63.8, gas_natural: 2.93, silver_ounce: 42.6, btc: 115200, eth: 4480, usdt: 2318000 };
const snapshots = [];
const series = {};
for (const ent of PRICE_ENTITIES) {
  const isUsd = ent.unit === 'usd';
  const base = BASE[ent.key] ?? (isUsd ? 50 + (ent.code.length * 7) % 900 : 1000000 + (ent.code.length * 131) % 90000000);
  const drift = ((ent.key.charCodeAt(0) + ent.key.length) % 7 - 3) / 100;
  const last = base;
  const prev = base / (1 + drift);
  const raw = { key: ent.key, last, first: prev * 1.001, high: Math.max(last, prev) * 1.004, low: Math.min(last, prev) * 0.996, prev, time: now - 6e5 };
  const snap = normalizeSnapshot(raw);
  if (!snap) continue;
  snapshots.push(snap);
  const pts = [];
  for (let d = 30; d >= 0; d--) {
    for (let h = 0; h < 24; h += 6) {
      const t = now - d * 864e5 - h * 3600e3;
      const wave = Math.sin((d * 24 + h) / 9) * 0.012 + Math.cos((d * 24 + h) / 31) * 0.02;
      pts.push({ t, v: +(snap.last * (1 - drift * (d / 30)) * (1 + wave)).toFixed(isUsd ? 2 : 0), src: 'ثروتمندی' });
    }
  }
  pts.push({ t: snap.time || now, v: snap.last, src: 'ثروتمندی' });
  series[ent.key] = pts;
}

const cars = [
  ['پژو پارس LX', 1840000000], ['پراید 111', 980000000], ['دنا پلاس توربو', 2650000000], ['کوییک R', 1120000000],
  ['تارا اتوماتیک', 2380000000], ['شاهین G', 1650000000], ['هایما S7', 3900000000], ['تیگو ۷ پرو', 4700000000]
].map(([name, price]) => ({ name, price, source: 'باما', page: 'https://bama.ir/price', at: now - 12e5 }));

const bundle = buildBundle({
  posts, snapshots, series, cars, now,
  sources: AGENCIES.slice(0, 12).map((a) => ({ id: a.id, name: a.name, count: 4, ok: true }))
});
bundle.demo = true;

const file = path.join(ROOT, 'data', APP.BUNDLE_FILE);
await writeFile(file, JSON.stringify(bundle), 'utf8');
console.log(`[demo] data/${APP.BUNDLE_FILE} با ${bundle.counts.posts} پست نمایشی و ${bundle.counts.assets} دارایی نوشته شد.`);
console.log('[demo] هشدار: فقط برای پیش‌نمایش محلی. برای برگرداندن: node scripts/collect.mjs --bundle-only');
