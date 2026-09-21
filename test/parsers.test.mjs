import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseRss, parseServatmandiSummary, parseServatmandiEntities,
  parseBamaPrices, parseTgjuHistory, toNumber, htmlToLines
} from '../assets/js/lib/parsers.js';

/* ---------------- RSS ---------------- */

const RSS_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
  <title>خبرگزاری نمونه</title>
  <item>
    <title><![CDATA[قیمت دلار در بازار آزاد افزایش یافت]]></title>
    <description><![CDATA[<p>در معاملات امروز قیمت ارز رشد کرد.</p>]]></description>
    <link>https://example.ir/news/1</link>
    <pubDate>Mon, 21 Sep 2026 09:30:00 +0000</pubDate>
    <media:content url="https://example.ir/img/1.jpg" medium="image"/>
  </item>
  <item>
    <title>خبر بدون تصویر</title>
    <description>توضیح ساده</description>
    <guid isPermaLink="false">id-2</guid>
    <dc:date>2026-09-21T10:00:00Z</dc:date>
  </item>
</channel>
</rss>`;

test('پارس RSS با CDATA و تصویر', () => {
  const items = parseRss(RSS_FIXTURE);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'قیمت دلار در بازار آزاد افزایش یافت');
  assert.equal(items[0].link, 'https://example.ir/news/1');
  assert.equal(items[0].thumbnail, 'https://example.ir/img/1.jpg');
  assert.equal(items[0].pubDate, 'Mon, 21 Sep 2026 09:30:00 +0000');
  assert.equal(items[1].link, 'id-2', 'وقتی link نیست از guid استفاده می‌شود');
});

test('پارس Atom', () => {
  const atom = `<feed xmlns="http://www.w3.org/2005/Atom">
    <entry><title>خبر اتمی</title><link href="https://a/1"/><updated>2026-09-21T08:00:00Z</updated>
    <summary>خلاصه</summary></entry>
  </feed>`;
  const items = parseRss(atom);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'خبر اتمی');
  assert.equal(items[0].link, 'https://a/1');
});

test('ورودی خالی RSS', () => {
  assert.deepEqual(parseRss(''), []);
  assert.deepEqual(parseRss('<html><body>not rss</body></html>'), []);
});

/* ---------------- ثروتمندی ---------------- */

// ساختار همان جدولی است که در صفحهٔ /Entity/Summary دیده می‌شود
const SM_HTML = `<!DOCTYPE html><html dir="rtl"><head>
<title>نمودار قیمت و تحلیل دلار آمریکا در بازار آزاد (USD)</title></head><body>
<div data-entity-code="100000000001" data-entity-name="دلار آمریکا در بازار آزاد"></div>
<h3>قیمت 1 دلار آمریکا به ریال</h3>
<table>
  <tr><td>آخرین تغییرات</td><td>1405/06/30 16:59:00</td><td></td></tr>
  <tr><td>آخرین قیمت</td><td>2315000</td><td>0.39</td></tr>
  <tr><td>اولین قیمت</td><td>2306000</td><td>0</td></tr>
  <tr><td>بیشترین قیمت</td><td>2318000</td><td>0.52</td></tr>
  <tr><td>کمترین قیمت</td><td>2306000</td><td>0</td></tr>
  <tr><td>آخرین قیمت روز کاری قبلی</td><td>2306000</td></tr>
</table></body></html>`;

test('پارس صفحهٔ خلاصهٔ ثروتمندی (HTML)', () => {
  const p = parseServatmandiSummary(SM_HTML, '100000000001');
  assert.equal(p.code, '100000000001');
  assert.equal(p.name, 'دلار آمریکا در بازار آزاد');
  assert.equal(p.last, 2315000);
  assert.equal(p.first, 2306000);
  assert.equal(p.high, 2318000);
  assert.equal(p.low, 2306000);
  assert.equal(p.prev, 2306000);
  assert.equal(p.unit, 'rial');
  assert.equal(p.timeText, '1405/06/30 16:59:00');
  const d = new Date(p.time);
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth() + 1, 9);
  assert.equal(d.getDate(), 21);
});

test('همان داده در قالب جدول markdown هم پارس می‌شود (مسیر پروکسی jina)', () => {
  const md = `# دلار آمریکا در بازار آزاد (USD)
| آخرین تغییرات | 1405/06/30 16:59:00 |
| آخرین قیمت | 2315000 | 0.39 |
| اولین قیمت | 2306000 | 0 |
| بیشترین قیمت | 2318000 | 0.52 |
| کمترین قیمت | 2306000 | 0 |
| آخرین قیمت روز کاری قبلی | 2306000 |
قیمت 1 دلار آمریکا به ریال`;
  const p = parseServatmandiSummary(md, '100000000001');
  assert.equal(p.last, 2315000);
  assert.equal(p.high, 2318000);
  assert.equal(p.prev, 2306000);
  assert.equal(p.timeText, '1405/06/30 16:59:00');
  assert.equal(new Date(p.time).getDate(), 21);
});

test('صفحهٔ بدون جدول قیمت null می‌دهد', () => {
  assert.equal(parseServatmandiSummary('<html><body>خطا</body></html>', '1'), null);
  assert.equal(parseServatmandiSummary(''), null);
});

test('واحد دلاری از متن صفحه تشخیص داده می‌شود', () => {
  const html = SM_HTML.replace('قیمت 1 دلار آمریکا به ریال', 'قیمت 1 انس طلا به دلار');
  assert.equal(parseServatmandiSummary(html, '10000000001901').unit, 'usd');
});

test('کشف دارایی‌ها از صفحهٔ دیده‌بان', () => {
  const html = `<a href="/Entity/Summary/10000000002001">نفت خام برنت</a>
    <a href="/Entity/Summary/10000000002002">گاز طبیعی</a>
    <a href="/Entity/Summary/10000000002001">نفت خام برنت</a>
    <a href="/TsetmcInstrument/Summary/123">صندوق طلا</a>`;
  const list = parseServatmandiEntities(html);
  assert.equal(list.length, 2, 'تکراری‌ها حذف و صندوق‌ها نادیده گرفته می‌شوند');
  assert.deepEqual(list[0], { code: '10000000002001', name: 'نفت خام برنت' });
  assert.deepEqual(parseServatmandiEntities(''), []);
});

/* ---------------- باما ---------------- */

const BAMA_HTML = `<div class="listing">
  <div class="card"><h3>پژو، پارس LX</h3><div class="price">1,840,000,000 تومان</div></div>
  <div class="card"><h3>پراید 111</h3><div class="price">980,000,000 تومان</div></div>
  <div class="card"><h3>کوییک R پلاس</h3><div class="price">1,120,000,000 تومان</div></div>
  <div class="card"><h3>یک عنوان بی‌ربط</h3><div class="price">5,000 تومان</div></div>
</div>`;

test('استخراج قیمت خودرو از باما', () => {
  const rows = parseBamaPrices(BAMA_HTML);
  const names = rows.map((r) => r.name);
  assert.ok(names.some((n) => n.includes('پژو')), JSON.stringify(names));
  assert.ok(names.some((n) => n.includes('پراید')));
  const pride = rows.find((r) => r.name.includes('پراید'));
  assert.equal(pride.price, 980000000);
  assert.ok(!rows.some((r) => r.price < 5e7), 'قیمت‌های نامعقول حذف می‌شوند');
  assert.deepEqual(parseBamaPrices(''), []);
});

/* ---------------- TGJU (پشتیبان) ---------------- */

test('پارس تاریخچهٔ TGJU', () => {
  const json = { data: [
    ['2315000', '2306000', '2318000', '2306000', '0', '0', '0', '1405/06/30'],
    ['2306000', '2300000', '2310000', '2295000', '0', '0', '0', '1405/06/29']
  ] };
  const points = parseTgjuHistory(json);
  assert.equal(points.length, 2);
  assert.equal(points[0].v, 2306000, 'مرتب‌سازی زمانی صعودی');
  assert.equal(points[1].v, 2315000);
  assert.equal(points[1].src, 'TGJU');
  assert.deepEqual(parseTgjuHistory({}), []);
});

/* ---------------- ابزارها ---------------- */

test('toNumber با ارقام فارسی و جداکننده', () => {
  assert.equal(toNumber('۲٬۳۱۵٬۰۰۰'), 2315000);
  assert.equal(toNumber('1,234.56 تومان'), 1234.56);
  assert.equal(toNumber('متن'), null);
  assert.equal(toNumber(''), null);
});

test('htmlToLines اسکریپت و استایل را حذف می‌کند', () => {
  const lines = htmlToLines('<div>سلام</div><script>var a=1;</script><style>b{}</style><p>دوم</p>');
  assert.ok(lines.includes('سلام'));
  assert.ok(lines.includes('دوم'));
  assert.ok(!lines.join('').includes('var a'));
});
