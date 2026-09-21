import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeSnapshot, rangeStats, priceAt, thinSeries, sma, sparkline,
  priceChart, priceTimeline, statsGrid, rialToToman, displayValue, RANGES, rangeById
} from '../assets/js/prices.js';

const NOW = Date.UTC(2026, 8, 21, 12, 0, 0);
const DAY = 864e5;

test('ریال به تومان تبدیل می‌شود', () => {
  assert.equal(rialToToman(2315000), 231500);
  assert.equal(displayValue(2315000, 'rial'), 231500);
  assert.equal(displayValue(4383.45, 'usd'), 4383.45);
});

test('نرمال‌سازی اسنپ‌شات ثروتمندی (دلار آمریکا)', () => {
  const s = normalizeSnapshot({
    key: 'usd', last: 2315000, first: 2306000, high: 2318000, low: 2306000,
    prev: 2306000, time: NOW
  });
  assert.equal(s.name, 'دلار آمریکا');
  assert.equal(s.last, 231500);
  assert.equal(s.unitLabel, 'تومان');
  assert.equal(s.change, 900);
  assert.ok(Math.abs(s.changePct - (900 / 230600) * 100) < 1e-9);
  assert.equal(s.sourceUrl, 'https://servatmandi.com/Entity/Summary/100000000001');
});

test('اسنپ‌شات دلاری (انس طلا) واحد دلار می‌گیرد', () => {
  const s = normalizeSnapshot({ key: 'gold_ounce', last: 4383.45, first: 4383.45, high: 4383.45, low: 4383.45, prev: 4383.45, time: NOW });
  assert.equal(s.unit, 'usd');
  assert.equal(s.last, 4383.45);
  assert.equal(s.changePct, 0);
});

test('کلید ناشناخته null می‌دهد', () => {
  assert.equal(normalizeSnapshot({ key: 'nope', last: 1 }), null);
});

test('آمار بازه: بیشینه، کمینه، میانگین و تغییر', () => {
  const series = [
    { t: NOW - 3 * DAY, v: 100 },
    { t: NOW - 2 * DAY, v: 130 },
    { t: NOW - DAY, v: 90 },
    { t: NOW, v: 120 }
  ];
  const st = rangeStats(series);
  assert.equal(st.points, 4);
  assert.equal(st.min, 90);
  assert.equal(st.max, 130);
  assert.equal(st.avg, 110);
  assert.equal(st.first, 100);
  assert.equal(st.last, 120);
  assert.equal(st.change, 20);
  assert.equal(st.changePct, 20);
  assert.equal(st.maxAt, NOW - 2 * DAY);
  assert.equal(st.minAt, NOW - DAY);
  assert.equal(rangeStats([]), null);
});

test('برش بازه در آمار اعمال می‌شود', () => {
  const series = [{ t: NOW - 10 * DAY, v: 10 }, { t: NOW, v: 20 }];
  const st = rangeStats(series, { from: NOW - DAY });
  assert.equal(st.points, 1);
  assert.equal(st.first, 20);
});

test('priceAt نزدیک‌ترین نقطه را پیدا می‌کند', () => {
  const series = [{ t: NOW - 2 * DAY, v: 100 }, { t: NOW, v: 200 }];
  assert.equal(priceAt(series, NOW).v, 200);
  assert.equal(priceAt(series, NOW).exactMatch, true);
  const near = priceAt(series, NOW - 10 * 3600e3);
  assert.equal(near.v, 200);
  assert.equal(near.exactMatch, false);
  assert.equal(priceAt([], NOW), null);
});

test('میانگین متحرک ساده', () => {
  const s = sma([{ t: 1, v: 10 }, { t: 2, v: 20 }, { t: 3, v: 30 }], 2);
  assert.deepEqual(s.map((x) => x.v), [10, 15, 25]);
});

test('نازک‌سازی سری طولانی', () => {
  const long = Array.from({ length: 1000 }, (_, i) => ({ t: i, v: i }));
  const thin = thinSeries(long, 100);
  assert.ok(thin.length <= 101);
  assert.equal(thin[thin.length - 1].v, 999);
  assert.equal(thinSeries(long, 5000).length, 1000);
});

test('اسپارک‌لاین SVG تولید می‌کند', () => {
  const svg = sparkline([{ t: 1, v: 1 }, { t: 2, v: 2 }]);
  assert.match(svg, /<svg/);
  assert.match(svg, /polyline/);
  assert.equal(sparkline([{ t: 1, v: 1 }]), '');
});

test('نمودار کامل با نقاط داده و tooltip', () => {
  const series = Array.from({ length: 10 }, (_, i) => ({ t: NOW - (9 - i) * 3600e3, v: 100 + i }));
  const out = priceChart(series, { unitLabel: 'تومان' });
  assert.match(out, /chart-wrap/);
  assert.match(out, /data-t="/);
  assert.match(out, /data-v="/);
  assert.match(out, /chart-grid/);
  assert.match(out, /<title>/);
  assert.match(priceChart([], {}), /chart-empty/);
});

test('جدول تاریخچه قیمت با زمان دقیق', () => {
  const rows = [{ t: NOW, v: 231500, src: 'ثروتمندی' }];
  const html = priceTimeline(rows, { unitLabel: 'تومان' });
  assert.match(html, /۱۴۰۵\/۰۶\/۳۰/);
  assert.match(html, /ثروتمندی/);
  assert.match(priceTimeline([]), /ثبت نشده/);
});

test('گرید آمار بازه', () => {
  const st = rangeStats([{ t: NOW - DAY, v: 100 }, { t: NOW, v: 120 }]);
  const html = statsGrid(st, { unitLabel: 'تومان' });
  assert.match(html, /بیشترین/);
  assert.match(html, /کمترین/);
  assert.match(html, /تعداد نقاط/);
  assert.equal(statsGrid(null), '');
});

test('بازه‌های نمودار', () => {
  assert.equal(RANGES.length, 7);
  assert.equal(rangeById('7d').ms, 7 * DAY);
  assert.equal(rangeById('nope').id, '7d', 'بازهٔ نامعتبر به پیش‌فرض می‌افتد');
});
