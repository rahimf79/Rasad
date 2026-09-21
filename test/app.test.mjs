/**
 * آزمون یکپارچه با jsdom: همان index.html و همان ماژول‌هایی که در مرورگر اجرا می‌شوند.
 * مسیر واقعی: fetch → parseRss → normalizeItem → Store → render → DOM
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// jsdom وابستگی undici دارد که به Node >= 22.19 نیاز دارد؛ اگر بارگذاری نشد
// به‌جای «markAsUncloneable is not a function» پیام خوانا می‌دهیم.
let JSDOM = null;
let jsdomError = null;
try {
  ({ JSDOM } = await import('jsdom'));
} catch (err) {
  jsdomError = err;
}

import { Store, createMemoryBackend, AuthError } from '../assets/js/db.js';
import { PRICE_ENTITIES, AGENCIES, AGENCY_BY_ID } from '../assets/js/config.js';
import { buildBundle } from '../assets/js/lib/bundle.js';
import { normalizeItem } from '../assets/js/posts.js';
import { normalizeSnapshot } from '../assets/js/prices.js';
import { parseServatmandiSummary } from '../assets/js/lib/parsers.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = await readFile(path.join(ROOT, 'index.html'), 'utf8');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ok = (body, type = 'text/html') => ({
  ok: true, status: 200,
  text: async () => body,
  json: async () => JSON.parse(body),
  headers: new Map([['content-type', type]])
});
const notFound = () => ({ ok: false, status: 404, text: async () => '', json: async () => ({}) });

function smHtml(code) {
  return `<!DOCTYPE html><html dir="rtl"><head><title>نمودار قیمت و تحلیل دارایی ${code}</title></head><body>
  <div data-entity-code="${code}" data-entity-name="دارایی ${code}"></div>
  <h3>قیمت 1 واحد به ریال</h3>
  <table>
    <tr><td>آخرین تغییرات</td><td>1405/06/30 16:59:00</td></tr>
    <tr><td>آخرین قیمت</td><td>2315000</td><td>0.39</td></tr>
    <tr><td>اولین قیمت</td><td>2306000</td><td>0</td></tr>
    <tr><td>بیشترین قیمت</td><td>2318000</td><td>0.52</td></tr>
    <tr><td>کمترین قیمت</td><td>2306000</td><td>0</td></tr>
    <tr><td>آخرین قیمت روز کاری قبلی</td><td>2306000</td></tr>
  </table></body></html>`;
}

const rssJson = (n) => JSON.stringify({
  status: 'ok',
  items: Array.from({ length: n }, (_, i) => ({
    title: `خبر شمارهٔ ${i + 1} دربارهٔ بازار ارز و طلا`,
    description: 'در معاملات امروز قیمت دلار و طلا تغییر کرد.',
    content: '<p>متن کامل خبر با جزئیات بیشتر دربارهٔ بازار.</p>',
    link: `https://example.ir/news/${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`,
    pubDate: new Date(Date.now() - i * 1800e3).toUTCString(),
    thumbnail: i % 2 === 0 ? 'https://example.ir/img/x.jpg' : ''
  }))
});

const BAMA = `<div><h3>پژو پارس LX</h3><div>1,840,000,000 تومان</div>
  <h3>پراید 111</h3><div>980,000,000 تومان</div></div>`;

function makeFetch({ bundle = null } = {}) {
  const calls = [];
  const fn = async (url) => {
    calls.push(String(url));
    const u = String(url);
    if (u.endsWith('data/latest.json')) return fn.bundle ? ok(JSON.stringify(fn.bundle), 'application/json') : notFound();
    if (u.includes('api.rss2json.com')) return ok(rssJson(4), 'application/json');
    if (u.includes('servatmandi.com/Entity/Summary/')) return ok(smHtml(u.split('/').pop()));
    if (u.includes('bama.ir')) return ok(BAMA);
    return notFound();
  };
  fn.calls = calls;
  fn.bundle = bundle;
  return fn;
}

/** بستهٔ آماده‌ای شبیه خروجی GitHub Actions: پست‌های چند خبرگزاری + اسنپ‌شات همهٔ دارایی‌ها */
function makeBundle({ now = Date.now(), perAgency = 3, agencies = ['irna', 'mehr', 'isna'] } = {}) {
  const posts = [];
  for (const id of agencies) {
    const ag = AGENCY_BY_ID[id];
    for (let i = 0; i < perAgency; i++) {
      posts.push(normalizeItem({
        title: `خبر ${i + 1} ${ag.name} دربارهٔ دلار و طلا`,
        description: 'در معاملات امروز قیمت دلار و طلا تغییر کرد.',
        content: '<p>متن کامل خبر.</p>',
        link: `https://${id}.ir/news/${now}-${i}`,
        pubDate: new Date(now - (i + 1) * 900e3).toUTCString(),
        thumbnail: i % 2 === 0 ? 'https://example.ir/img/x.jpg' : ''
      }, ag, now));
    }
  }
  const snapshots = PRICE_ENTITIES.map((e) => normalizeSnapshot({ ...parseServatmandiSummary(smHtml(e.code), e.code), key: e.key })).filter(Boolean);
  const series = Object.fromEntries(snapshots.map((s) => [s.key, [{ t: now - 7200e3, v: s.last * 0.99 }, { t: now - 3600e3, v: s.last * 1.01 }, { t: now, v: s.last }]]));
  return buildBundle({
    posts, snapshots, series, now,
    cars: [{ name: 'پژو پارس LX', price: 1840000000, source: 'باما', page: 'https://bama.ir/price', at: now }],
    sources: agencies.map((id) => ({ id, name: AGENCY_BY_ID[id].name, count: perAgency, ok: true }))
  });
}

async function setup({ bundle = null } = {}) {
  if (!JSDOM) {
    throw new Error(
      `jsdom روی Node ${process.version} بارگذاری نشد: ${jsdomError?.message}\n` +
      'وابستگی jsdom (undici) به Node >= 22.19 نیاز دارد — در ورک‌فلو node-version را روی 22 بگذارید.'
    );
  }
  const dom = new JSDOM(HTML, { url: 'http://localhost:4173/', pretendToBeVisual: true });
  const { window } = dom;
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};

  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.location = window.location;
  globalThis.history = window.history;
  try { Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true }); } catch { /* Node 22 */ }
  globalThis.Node = window.Node;
  globalThis.Event = window.Event;
  globalThis.Blob = window.Blob;
  globalThis.FormData = window.FormData;
  globalThis.indexedDB = undefined;
  globalThis.localStorage = window.localStorage;

  const app = await import('../assets/js/app.js');
  const fetchImpl = makeFetch({ bundle });
  const store = new Store(createMemoryBackend(), { sessionId: 'test' });
  await store.setSetting('app', { autoRefresh: false, feedSize: 30, newsDays: 120, priceDays: 1095, customFeeds: [] });

  await app.boot({ store, fetchImpl, throttle: 0, noTimers: true });
  await sleep(20);
  return { app, dom, window, document: window.document, store, fetchImpl };
}

test('راه‌اندازی: پوسته، ناوبری پنج‌تایی و ریل استوری ساخته می‌شوند', async () => {
  const { document } = await setup();
  assert.ok(document.querySelector('.topbar'));
  assert.ok(document.querySelector('.brand .wordmark'), 'لوگوتایپ در هدر هست');
  assert.ok(document.querySelector('.topbar a[href="#/activity"]') && document.querySelector('.topbar a[href="#/inbox"]'), 'قلب و پیام در هدر خانه');
  assert.equal(document.querySelectorAll('.bottom-nav .nav-item:not([data-desktop])').length, 5, 'پنج آیکون اینستاگرام');
  assert.equal(document.querySelectorAll('.bottom-nav .nav-item.active').length, 1);
  assert.ok(document.querySelector('#storyRail'), 'ریل استوری داخل خانه');
});

test('بستهٔ آماده: صفحه بدون هیچ جمع‌آوری‌ای در مرورگر، خبرها و قیمت‌های آماده را نشان می‌دهد', async () => {
  const bundle = makeBundle();
  const { app, document, fetchImpl, store } = await setup({ bundle });

  // تنها درخواست داده: data/latest.json — هیچ تماسی با خبرگزاری‌ها، ثروتمندی یا باما
  const dataCalls = fetchImpl.calls.filter((c) => c.endsWith('data/latest.json'));
  assert.equal(dataCalls.length, 1, 'یک بار بسته خوانده شد');
  const scraping = fetchImpl.calls.filter((c) => /rss2json|servatmandi|bama|allorigins|jina|irna\.ir|mehrnews/.test(c));
  assert.deepEqual(scraping, [], 'مرورگر خودش خبر/قیمت جمع نمی‌کند');

  assert.equal(app.state.bundle.generatedAt, bundle.generatedAt);
  assert.equal(app.state.posts.length, bundle.posts.length, 'همهٔ پست‌های بسته بارگذاری شد');
  assert.equal(app.state.assets.get('usd').last, 231500, 'قیمت دلار از بسته');
  assert.ok(app.state.assets.size >= PRICE_ENTITIES.length, 'همهٔ دارایی‌ها از بسته');
  assert.ok(app.state.assets.has('car:پژو پارس LX') || [...app.state.assets.keys()].some((k) => k.startsWith('car')), 'خودرو هم از بسته');

  assert.ok(document.querySelectorAll('.post').length > 0, 'پست‌ها بلافاصله رندر شدند');
  assert.ok(document.querySelectorAll('#storyRail .story-item').length > 0, 'استوری‌ها از بسته ساخته شدند');

  // کش آفلاین: پست‌های بسته در ذخیره‌سازی محلی هم هستند
  await sleep(20);
  assert.equal((await store.allPosts()).length, bundle.posts.length);
});

test('بررسی بستهٔ جدید: انتشار تازهٔ GitHub Actions بدون بارگذاری مجدد اعمال می‌شود', async () => {
  const first = makeBundle({ now: Date.now() - 1800e3, perAgency: 2 });
  const { app, fetchImpl } = await setup({ bundle: first });
  assert.equal(app.state.posts.length, first.posts.length);

  const r0 = await app.checkForNewBundle({ force: true });
  assert.equal(r0.fresh, false, 'همان بسته → چیزی عوض نمی‌شود');

  fetchImpl.bundle = makeBundle({ now: Date.now(), perAgency: 4, agencies: ['irna', 'mehr', 'isna', 'tasnim'] });
  const r1 = await app.checkForNewBundle({ force: true });
  assert.equal(r1.fresh, true);
  assert.ok(r1.newCount > 0, 'پست‌های تازه شمرده شدند');
  assert.equal(app.state.bundle.generatedAt, fetchImpl.bundle.generatedAt);
  assert.ok(app.state.posts.length > first.posts.length);
  assert.deepEqual(fetchImpl.calls.filter((c) => /rss2json|servatmandi|bama/.test(c)), [], 'باز هم بدون جمع‌آوری در مرورگر');
});

test('جمع‌آوری زنده: خبرها و قیمت‌ها از مسیر واقعی وارد آرشیو می‌شوند', async () => {
  const { app, store, document, fetchImpl } = await setup();

  const res = await app.refreshLive();
  assert.ok(res.newsCount > 0, 'خبر جمع‌آوری شد');
  assert.ok(res.assetCount >= PRICE_ENTITIES.length, 'همهٔ دارایی‌های ثروتمندی دریافت شدند');

  assert.ok(fetchImpl.calls.some((c) => c.includes('servatmandi.com/Entity/Summary/100000000001')), 'دلار از ثروتمندی');
  assert.ok(fetchImpl.calls.some((c) => c.includes('servatmandi.com/Entity/Summary/10000000002002')), 'گاز طبیعی از ثروتمندی');
  assert.ok(fetchImpl.calls.some((c) => c.includes('bama.ir')), 'قیمت خودرو از باما');

  // دلار: ۲٬۳۱۵٬۰۰۰ ریال → ۲۳۱٬۵۰۰ تومان
  assert.equal(app.state.assets.get('usd').last, 231500);
  assert.equal(app.state.assets.get('usd').source, 'ثروتمندی');

  const points = await store.getPriceHistory('usd');
  assert.ok(points.length >= 1, 'نقطهٔ قیمتی آرشیو شد');

  await app.renderRoute();
  await sleep(30);
  assert.ok(document.querySelectorAll('.post').length > 0, 'پست‌ها در فید رندر شدند');
  assert.ok(document.querySelectorAll('#storyRail .story-item').length > 0, 'استوری ۲۴ ساعته ساخته شد');
});

test('صفحهٔ خبرگزاری (پروفایل) پست‌های همان منبع را نشان می‌دهد', async () => {
  const { app, document, window } = await setup();
  await app.refreshLive();

  window.location.hash = '#/u/irna';
  await sleep(60);

  assert.ok(document.querySelector('[data-agency-view]') || document.querySelector('.profile'), 'صفحهٔ پروفایل باز شد');
  const head = document.querySelector('.profile-top');
  assert.ok(head, 'بخش بالای پروفایل (آواتار + آمار) رندر شد');
  assert.match(document.querySelector('.profile-bio h1').textContent, /ایرنا/);
  assert.equal(document.querySelectorAll('.profile-stats > div').length, 3, 'سه آمار مثل اینستاگرام');
  assert.ok(document.querySelector('.profile-btns .btn-follow'), 'دکمهٔ دنبال کردن');
  assert.ok(document.querySelectorAll('.profile-grid .grid-cell').length > 0, 'گرید پست‌های همان خبرگزاری');
  assert.match(document.querySelector('#topbar').textContent, /irna/, 'هندل در نوار بالا');
});

test('صفحهٔ قیمت: نمودار، آمار و بخش کامنت قفل‌شده برای مهمان', async () => {
  const { app, document, window } = await setup();
  await app.refreshLive();

  window.location.hash = '#/price/usd';
  await sleep(60);

  assert.ok(document.querySelector('.price-chart'), 'نمودار رسم شد');
  assert.ok(document.querySelectorAll('.chart-dot').length > 0, 'نقاط داده برای tooltip');
  const dot = document.querySelector('.chart-dot');
  assert.ok(+dot.dataset.t > 0 && +dot.dataset.v > 0, 'هر نقطه زمان و قیمت دقیق دارد');
  assert.match(document.querySelector('#comments').innerHTML, /auth-gate/);
  assert.equal(document.querySelectorAll('.comment-form').length, 0, 'مهمان فرم کامنت ندارد');
});

test('کامنت بدون حساب کاربری رد می‌شود، با حساب ثبت می‌شود', async () => {
  const { app, document, window, store } = await setup();
  await app.refreshLive();

  await assert.rejects(() => store.addComment({ targetId: 'price:usd', text: 'بدون ورود' }), AuthError);

  // ثبت‌نام از طریق همان فرمی که کاربر می‌بیند
  app.openAuth('register');
  const form = document.querySelector('[data-auth-form="register"]');
  assert.ok(form, 'فرم ثبت‌نام باز شد');
  form.querySelector('[name="username"]').value = 'sara_dev';
  form.querySelector('[name="password"]').value = 'secret123';
  form.querySelector('[name="displayName"]').value = 'سارا';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(40);

  assert.ok(app.state.user, 'کاربر وارد شد');
  assert.equal(app.state.user.username, 'sara_dev');
  assert.equal(app.state.user.hash, undefined, 'هش رمز به کلاینت نمی‌رسد');

  window.location.hash = '#/price/usd';
  await sleep(60);
  const cform = document.querySelector('.comment-form');
  assert.ok(cform, 'کاربر واردشده فرم کامنت دارد');
  cform.querySelector('input[name="text"]').value = 'دلار در مقاومت است';
  cform.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(40);

  const list = await store.listComments('price:usd');
  assert.equal(list.length, 1);
  assert.equal(list[0].username, 'sara_dev');
  assert.match(document.querySelector('#comments').textContent, /دلار در مقاومت است/);
});

test('دنبال کردن برای مهمان درخواست ورود می‌کند', async () => {
  const { app, document, window } = await setup();
  await app.refreshLive();
  await app.renderRoute();
  await sleep(30);

  const btn = document.querySelector('.btn-follow');
  assert.ok(btn, 'دکمهٔ دنبال کردن در فید هست');
  btn.dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true }));
  await sleep(30);
  assert.ok(document.querySelector('#overlay').classList.contains('open'), 'مودال ورود باز شد');
  assert.match(document.querySelector('#overlay').textContent, /ورود به حساب کاربری/);
});

test('مسیر جست‌وجو نتیجهٔ خبرگزاری و پست می‌دهد', async () => {
  const { app, document, window } = await setup();
  await app.refreshLive();

  window.location.hash = '#/search?q=' + encodeURIComponent('دلار');
  await sleep(80);
  const body = document.querySelector('#searchBody');
  assert.ok(body, 'بدنهٔ جست‌وجو رندر شد');
  assert.match(body.textContent, /پست‌ها|خبرگزاری‌ها|نتیجه‌ای پیدا نشد/);
});

test('سرچ بدون عبارت، اکسپلور اینستاگرامی نشان می‌دهد', async () => {
  const { app, document, window } = await setup();
  await app.refreshLive();

  window.location.hash = '#/search';
  await sleep(80);
  const body = document.querySelector('#searchBody');
  assert.ok(body);
  assert.match(body.textContent, /اکسپلور/);
  assert.ok(document.querySelectorAll('.explore-grid .exp-cell').length > 0, 'گرید اکسپلور پر است');
  assert.ok(document.querySelector('#searchInput'), 'کادر جست‌وجو هست');
});

test('بازار: کارت قیمت‌ها با منبع ثروتمندی', async () => {
  const { app, document, window } = await setup();
  await app.refreshLive();

  window.location.hash = '#/prices';
  await sleep(60);
  const rows = document.querySelectorAll('.mrow');
  assert.ok(rows.length > 0);
  assert.match(document.querySelector('[data-prices-view]').textContent, /ثروتمندی/);
  assert.match(document.querySelector('[data-prices-view]').textContent, /باما/);
  assert.match(document.querySelector('#topbar').textContent, /بازار/, 'عنوان صفحه در نوار بالا');
  assert.ok(document.querySelector('#topbar [data-back]'), 'دکمهٔ برگشت');
});

test('لایک با آیکون SVG عوض می‌شود و منوی سه‌نقطه شیت باز می‌کند', async () => {
  const { app, document, window } = await setup({ bundle: makeBundle() });
  app.openAuth('register');
  const form = document.querySelector('[data-auth-form="register"]');
  form.querySelector('[name="username"]').value = 'ali_dev';
  form.querySelector('[name="password"]').value = 'secret123';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(60);
  assert.ok(app.state.user);

  const like = document.querySelector('.post [data-like]');
  assert.ok(like && !like.classList.contains('on'));
  like.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await sleep(30);
  assert.ok(like.classList.contains('on'), 'قلب فعال شد');
  assert.ok(like.querySelector('svg'), 'آیکون SVG است نه ایموجی');

  document.querySelector('[data-post-menu]').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await sleep(10);
  assert.ok(document.querySelector('#sheet').classList.contains('open'), 'شیت باز شد');
  assert.match(document.querySelector('#sheet').textContent, /کپی لینک خبر/);
});

test('تنظیمات: وضعیت بستهٔ آماده و دکمهٔ دریافت زنده فقط به‌صورت دستی', async () => {
  const { document, window } = await setup({ bundle: makeBundle() });
  window.location.hash = '#/settings';
  await sleep(60);
  const txt = document.querySelector('[data-settings-view]').textContent;
  assert.match(txt, /GitHub Actions/);
  assert.match(txt, /آخرین بروزرسانی خودکار/);
  assert.ok(document.querySelector('[data-refresh-now]'), 'دریافت زنده فقط با کلیک کاربر');
  assert.ok(document.querySelector('[data-theme-seg] [data-theme="light"]'), 'انتخاب پوسته');
});

test('خروجی HTML اولیه شامل لوگو، ناوبری و اسکریپت ماژول است', async () => {
  assert.match(HTML, /class="wordmark"/);
  assert.match(HTML, /Grand\+Hotel/);
  assert.match(HTML, /type="module"/);
  assert.equal(AGENCIES.length >= 15, true);
});
