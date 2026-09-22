/**
 * «بستهٔ آماده» — همان چیزی که GitHub Actions می‌سازد و مرورگر فقط می‌خواند.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { buildBundle, normalizeBundle, compactSeries, sparkOf, slimPost, assetFromSeries, BUNDLE_LIMITS, BUNDLE_VERSION } from '../assets/js/lib/bundle.js';
import { writeLatestBundle } from '../scripts/lib/bundle-disk.mjs';
import { PRICE_ENTITIES, ENTITY_BY_KEY, APP } from '../assets/js/config.js';

const NOW = Date.UTC(2026, 8, 21, 12, 0, 0);
const DAY = 864e5;

const post = (i, sourceId = 'irna') => ({
  id: `${sourceId}:${i}`, title: `خبر ${i}`, desc: 'توضیح', content: 'x'.repeat(5000), link: `https://irna.ir/${i}`,
  sourceId, sourceName: 'ایرنا', sourceFull: 'خبرگزاری جمهوری اسلامی', sourceHandle: 'irna', sourceColor: '#000',
  date: NOW - i * 60e3, exactDate: '۱۴۰۵/۰۶/۳۰ - ۱۲:۰۰', exactDateShort: '۱۴۰۵/۰۶/۳۰', collectedAt: NOW,
  img: '', topic: 'اقتصاد', hashtags: ['اقتصاد', 'ایران', 'دلار', 'طلا']
});

test('slimPost متن بلند را کوتاه و فیلدهای نمایشی را حفظ می‌کند', () => {
  const s = slimPost(post(1));
  assert.equal(s.id, 'irna:1');
  assert.ok(s.content.length <= BUNDLE_LIMITS.contentMax + 1);
  assert.equal(s.hashtags.length, 3);
  assert.equal(s.exactDate, '۱۴۰۵/۰۶/۳۰ - ۱۲:۰۰', 'تاریخ دقیق انتشار حفظ می‌شود');
  assert.equal(slimPost(null), null);
});

test('compactSeries: نقاط تازه دست‌نخورده، نقاط قدیمی سطل‌بندی می‌شوند و آخرین نقطه همیشه می‌ماند', () => {
  const series = [];
  // ۴۰۰ روز، هر ۳۰ دقیقه یک نقطه = ۱۹٬۲۰۰ نقطه
  for (let t = NOW - 400 * DAY; t <= NOW; t += 1800e3) series.push({ t, v: 100 + Math.sin(t / 1e9) });
  const out = compactSeries(series, NOW);
  assert.ok(out.length < series.length / 4, `فشرده شد: ${series.length} → ${out.length}`);
  assert.equal(out[out.length - 1].t, NOW, 'آخرین نقطه حفظ شد');
  const recent = out.filter((p) => NOW - p.t <= 2 * DAY);
  assert.equal(recent.length, series.filter((p) => NOW - p.t <= 2 * DAY).length, 'دو روز اخیر کامل است');
  const old = out.filter((p) => NOW - p.t > 365 * DAY);
  assert.ok(old.length <= 36, 'قدیمی‌تر از یک سال روزی یک نقطه');
  assert.deepEqual(out.map((p) => p.t), [...out.map((p) => p.t)].sort((a, b) => a - b), 'مرتب صعودی');
  assert.deepEqual(compactSeries([{ t: 1, v: 1 }]), [{ t: 1, v: 1 }]);
});

test('sparkOf آخرین n نقطه را بدون فیلدهای اضافی برمی‌گرداند', () => {
  const series = Array.from({ length: 100 }, (_, i) => ({ t: i, v: i, o: 1, h: 2, l: 0, src: 'x' }));
  const s = sparkOf(series, 10);
  assert.equal(s.length, 10);
  assert.deepEqual(s[9], { t: 99, v: 99 });
});

test('assetFromSeries وقتی اسنپ‌شات تازه نیست از آرشیو یک دارایی قابل نمایش می‌سازد', () => {
  const ent = ENTITY_BY_KEY.usd;
  const a = assetFromSeries(ent, [{ t: NOW - 2 * DAY, v: 200000 }, { t: NOW - DAY - 1000, v: 210000 }, { t: NOW, v: 231000 }]);
  assert.equal(a.key, 'usd');
  assert.equal(a.last, 231000);
  assert.equal(a.prev, 210000, 'مبنای تغییر: آخرین نقطهٔ ۲۴ ساعت قبل');
  assert.equal(a.change, 21000);
  assert.equal(a.unitLabel, 'تومان');
  assert.equal(a.stale, true);
  assert.equal(assetFromSeries(ent, []), null);
});

test('buildBundle: پست‌های تازه (بدون تکرار و با سقف)، همهٔ دارایی‌ها با اسپارک‌لاین، خودرو و منابع', () => {
  const posts = [];
  for (let i = 0; i < BUNDLE_LIMITS.posts + 50; i++) posts.push(post(i));
  posts.push(post(3)); // تکراری
  const snapshots = [{ key: 'usd', code: ENTITY_BY_KEY.usd.code, name: 'دلار آمریکا', short: 'USD', group: 'fx', unit: 'rial', unitLabel: 'تومان', last: 231500, first: 230600, high: 231800, low: 230600, prev: 230600, change: 900, changePct: 0.39, time: NOW, source: 'ثروتمندی' }];
  const series = { usd: Array.from({ length: 200 }, (_, i) => ({ t: NOW - (200 - i) * 3600e3, v: 230000 + i })), gold18: [{ t: NOW - DAY, v: 9000000 }, { t: NOW, v: 9100000 }] };
  const b = buildBundle({
    posts, snapshots, series, now: NOW,
    cars: [{ name: 'پراید', price: 980000000, source: 'باما', page: 'p', at: NOW }, { name: '', price: 1 }],
    sources: [{ id: 'irna', name: 'ایرنا', count: 4, ok: true }, { id: 'mehr', name: 'مهر', count: 0, ok: false }]
  });

  assert.equal(b.version, BUNDLE_VERSION);
  assert.equal(b.generatedAt, NOW);
  assert.equal(b.intervalMinutes, APP.COLLECT_INTERVAL_MIN);
  assert.equal(b.nextRunAt, NOW + APP.COLLECT_INTERVAL_MIN * 60e3);
  assert.equal(b.posts.length, BUNDLE_LIMITS.posts, 'سقف پست');
  assert.equal(new Set(b.posts.map((p) => p.id)).size, b.posts.length, 'بدون تکرار');
  assert.equal(b.posts[0].id, 'irna:0', 'جدیدترین اول');

  const usd = b.assets.find((a) => a.key === 'usd');
  assert.equal(usd.last, 231500);
  assert.equal(usd.stale, false);
  assert.equal(usd.spark.length, BUNDLE_LIMITS.spark, 'اسپارک‌لاین محدود');
  const gold = b.assets.find((a) => a.key === 'gold18');
  assert.equal(gold.stale, true, 'دارایی بدون اسنپ‌شات تازه از آرشیو ساخته می‌شود');
  assert.equal(gold.last, 9100000);
  assert.equal(b.assets.length, 2, 'دارایی بدون هیچ داده‌ای در بسته نیست');
  assert.equal(b.counts.freshAssets, 1);
  assert.equal(b.cars.length, 1, 'ردیف خودروی نامعتبر حذف شد');
  assert.equal(b.counts.sourcesOk, 1);
  assert.equal(b.sources.find((s) => s.id === 'irna').posts, BUNDLE_LIMITS.posts);
  assert.ok(b.generatedAtJalali.length > 5);
});

test('normalizeBundle ورودی خراب را رد و ورودی درست را با پیش‌فرض‌ها برمی‌گرداند', () => {
  assert.equal(normalizeBundle(null), null);
  assert.equal(normalizeBundle({ posts: 'x' }), null);
  const n = normalizeBundle({ posts: [post(1), { id: 'bad' }], assets: [{ key: 'usd', last: 1, spark: [{ t: 1, v: 1 }, { t: 'x' }] }, { key: 'nope' }] });
  assert.equal(n.posts.length, 1);
  assert.equal(n.assets.length, 1);
  assert.equal(n.assets[0].spark.length, 1);
  assert.equal(n.intervalMinutes, APP.COLLECT_INTERVAL_MIN);
  assert.deepEqual(n.cars, []);
});

test('writeLatestBundle از روی پوشهٔ data همان فایل latest.json را می‌سازد که مرورگر می‌خواند', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rasad-'));
  try {
    await mkdir(path.join(dir, 'news'), { recursive: true });
    await mkdir(path.join(dir, 'prices'), { recursive: true });
    await writeFile(path.join(dir, 'news', '2026-09-21.json'), JSON.stringify([post(1), post(2)]));
    await writeFile(path.join(dir, 'news', '2026-09-20.json'), JSON.stringify([post(3, 'mehr')]));
    await writeFile(path.join(dir, 'news', 'garbage.txt'), 'x');
    await writeFile(path.join(dir, 'prices', 'usd.json'), JSON.stringify({ key: 'usd', series: [{ t: NOW - DAY, v: 230000 }, { t: NOW, v: 231000 }] }));
    await writeFile(path.join(dir, 'cars.json'), JSON.stringify({ rows: [{ name: 'پراید', price: 980000000, source: 'باما', page: 'p', at: NOW }] }));

    const logs = [];
    const b = await writeLatestBundle({ dataDir: dir, now: NOW, log: (m) => logs.push(m) });
    const onDisk = JSON.parse(await readFile(path.join(dir, APP.BUNDLE_FILE), 'utf8'));
    assert.equal(onDisk.generatedAt, NOW);
    assert.equal(onDisk.posts.length, 3);
    assert.equal(onDisk.assets.length, 1);
    assert.equal(onDisk.assets[0].key, 'usd');
    assert.equal(onDisk.cars.length, 1);
    assert.equal(normalizeBundle(onDisk).posts.length, 3, 'مرورگر همین فایل را می‌پذیرد');
    assert.equal(b.counts.posts, 3);
    assert.ok(logs.some((l) => l.includes(APP.BUNDLE_FILE)));

    // اجرای بعدی بدون گزارش منابع، منابع بستهٔ قبلی را نگه می‌دارد
    await writeLatestBundle({ dataDir: dir, now: NOW + 1, sources: [{ id: 'irna', name: 'ایرنا', count: 2, ok: true }], log: () => {} });
    const again = await writeLatestBundle({ dataDir: dir, now: NOW + 2, log: () => {} });
    assert.equal(again.sources.length, 1);
    assert.equal(again.sources[0].id, 'irna');

    // حالت dry چیزی نمی‌نویسد
    const before = await readFile(path.join(dir, APP.BUNDLE_FILE), 'utf8');
    await writeLatestBundle({ dataDir: dir, now: NOW + 3, dry: true, log: () => {} });
    assert.equal(await readFile(path.join(dir, APP.BUNDLE_FILE), 'utf8'), before);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('همهٔ دارایی‌های پیکربندی‌شده کلید یکتا دارند (کلید فایل آرشیو و بسته)', () => {
  const keys = PRICE_ENTITIES.map((e) => e.key);
  assert.equal(new Set(keys).size, keys.length);
});
