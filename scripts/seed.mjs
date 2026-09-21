#!/usr/bin/env node
/**
 * ساخت دادهٔ اولیهٔ آرشیو از مقادیری که مستقیماً از صفحات ثروتمندی خوانده شده‌اند.
 * این اسکریپت فقط برای پرکردن نمودارها پیش از اولین اجرای جمع‌آوری خودکار است.
 *
 *   node scripts/seed.mjs
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ENTITY_BY_KEY, APP } from '../assets/js/config.js';
import { normalizeSnapshot } from '../assets/js/prices.js';
import { parseJalaliDateTime, formatJalali } from '../assets/js/lib/jalali.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRICE_DIR = path.join(ROOT, 'data', 'prices');

/** مقادیر خوانده‌شده از صفحهٔ Entity/Summary ثروتمندی (واحد: ریال / دلار) */
const SEED = [
  { key: 'usd', raw: { last: 2315000, first: 2306000, high: 2318000, low: 2306000, prev: 2306000, timeText: '1405/06/30 16:59:00' } },
  { key: 'gold18', raw: { last: 243727463, first: 243383961, high: 245439685, low: 243288838, prev: 243383961, timeText: '1405/06/29 21:00:00' } },
  { key: 'gold_ounce', raw: { last: 4383.45, first: 4383.45, high: 4383.45, low: 4383.45, prev: 4383.45, timeText: '1405/06/29 06:26:00' } }
];

async function main() {
  await mkdir(PRICE_DIR, { recursive: true });
  const assets = [];

  for (const item of SEED) {
    const ent = ENTITY_BY_KEY[item.key];
    if (!ent) { console.warn('دارایی ناشناخته:', item.key); continue; }
    const snap = normalizeSnapshot({ ...item.raw, key: item.key });
    const t = parseJalaliDateTime(item.raw.timeText);
    if (!snap || !t) { console.warn('سید ناموفق:', item.key); continue; }

    const series = [
      { t, v: snap.last, o: snap.first, h: snap.high, l: snap.low, src: 'ثروتمندی' }
    ];
    if (snap.high !== snap.last) series.push({ t: t - 3600e3, v: snap.high, src: 'ثروتمندی/سقف روز' });
    if (snap.low !== snap.last) series.push({ t: t - 7200e3, v: snap.low, src: 'ثروتمندی/کف روز' });

    const rec = {
      key: item.key,
      meta: {
        key: item.key,
        name: snap.name,
        unit: snap.unit,
        source: 'ثروتمندی',
        sourceUrl: snap.sourceUrl,
        updatedAt: Date.now(),
        seeded: true
      },
      series: series.sort((a, b) => a.t - b.t)
    };
    await writeFile(path.join(PRICE_DIR, `${item.key}.json`), JSON.stringify(rec, null, 2), 'utf8');
    assets.push(item.key);
    console.log(`seed ${item.key} → ${snap.last} ${snap.unitLabel} در ${formatJalali(t)}`);
  }

  const index = {
    app: APP.name,
    version: APP.version,
    generatedAt: Date.now(),
    generatedAtJalali: formatJalali(Date.now(), { seconds: true }),
    news: { files: [], days: 0 },
    prices: { assets, collected: assets.length, errors: 0 },
    cars: { count: 0 },
    discovery: { total: 0, fresh: 0 },
    sources: [],
    retention: APP.RETENTION,
    note: 'دادهٔ اولیه؛ با اولین اجرای GitHub Actions جایگزین/تکمیل می‌شود.'
  };
  await writeFile(path.join(ROOT, 'data', 'index.json'), JSON.stringify(index, null, 2), 'utf8');
  console.log('data/index.json نوشته شد ✓');
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
