import test from 'node:test';
import assert from 'node:assert/strict';

import {
  renderPost, renderPostDetail, renderCommentBox, renderCommentList, renderStoryRail,
  renderProfile, renderPriceCard, renderPriceDetail, renderAuthModal, renderSearchResults,
  renderExplore, renderReel, avatar, followButton, renderNav, renderTopbar, renderMarket,
  renderSheet, renderBrandMenu, renderActivity, renderArchiveDays, NAV_ITEMS
} from '../assets/js/render.js';
import { ICONS, icon } from '../assets/js/icons.js';
import { AGENCY_BY_ID } from '../assets/js/config.js';

const NOW = Date.now();
const post = {
  id: 'irna:abc', title: 'عنوان <script>alert(1)</script> خبر', desc: 'توضیح',
  link: 'https://irna.ir/1', sourceId: 'irna', sourceName: 'ایرنا', sourceHandle: 'irna',
  sourceFull: 'خبرگزاری جمهوری اسلامی', sourceColor: '#22c55e', date: NOW - 3600e3,
  exactDate: '۱۴۰۵/۰۶/۳۰ - ۱۲:۰۰', exactDateShort: '۱۴۰۵/۰۶/۳۰', topic: 'اقتصاد',
  hashtags: ['اقتصاد'], img: '', collectedAt: NOW
};

test('renderPost محتوای خطرناک را escape می‌کند', () => {
  const html = renderPost(post, { commentCount: 2 });
  assert.ok(!html.includes('<script>'), 'تگ اسکریپت نباید وارد HTML شود');
  assert.ok(html.includes('&lt;script&gt;'));
  assert.match(html, /data-post="irna:abc"/);
  assert.match(html, /href="#\/u\/irna"/);
});

test('renderPost ساختار کارت اینستاگرام را دارد: هدر → رسانه → اکشن‌ها → لایک → کپشن → نظرها → زمان', () => {
  const html = renderPost(post, {
    liked: true, saved: true, likeCount: 12, commentCount: 3,
    comments: [{ author: 'سارا', text: 'عالی بود' }]
  });
  const order = ['post-head', 'post-media', 'post-actions', 'class="likes"', 'class="caption', 'view-comments', 'cmt-preview', 'post-time', 'add-comment']
    .map((k) => html.indexOf(k));
  assert.ok(order.every((i) => i >= 0), 'همهٔ بخش‌ها وجود دارند: ' + order.join(','));
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'ترتیب بخش‌ها مثل اینستاگرام است');

  // ردیف اکشن: قلب، نظر، ارسال در یک سمت و ذخیره در سمت دیگر — همه SVG، نه ایموجی
  assert.match(html, /class="act on" data-like="irna:abc"/);
  assert.match(html, /class="act save on" data-save="irna:abc"/);
  assert.ok(html.includes(ICONS.heartFill({ size: 24 })), 'قلب پرشده برای پست لایک‌شده');
  assert.ok(html.includes(ICONS.bookmarkFill()), 'بوکمارک پرشده برای پست ذخیره‌شده');
  assert.ok(html.includes(ICONS.comment()) && html.includes(ICONS.share()), 'آیکون نظر و ارسال');
  assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(html), 'هیچ ایموجی‌ای در کارت پست نیست');

  assert.match(html, /۱۲ پسند/);
  assert.match(html, /عالی بود/);
  assert.match(html, /مشاهدهٔ همهٔ ۳ نظر/);
  assert.match(html, /افزودن نظر…/);
  assert.match(html, /data-post-menu="irna:abc"/, 'دکمهٔ سه‌نقطه در هدر');
  assert.match(html, /verified/, 'تیک آبی کنار نام خبرگزاری');
});

test('renderPost بدون لایک/ذخیره آیکون خطی نشان می‌دهد و دکمهٔ دنبال کردن آبی کنار نام دارد', () => {
  const html = renderPost(post, { liked: false, saved: false, following: false });
  assert.ok(html.includes(ICONS.heart()), 'قلب خالی');
  assert.ok(html.includes(ICONS.bookmark()), 'بوکمارک خالی');
  assert.match(html, /txt-btn btn-follow/, 'دنبال کردن متنی آبی مثل اینستاگرام');
  assert.ok(!renderPost(post, { following: true }).includes('btn-follow'), 'برای دنبال‌شده دکمه نیست');
});

test('renderCommentBox برای کاربر مهمان قفل است', () => {
  const guest = renderCommentBox(null, { targetId: 'price:usd' });
  assert.match(guest, /auth-gate/);
  assert.match(guest, /حساب کاربری/);
  assert.ok(!guest.includes('<form'));

  const member = renderCommentBox({ username: 'sara', displayName: 'سارا', avatarHue: 200 }, { targetId: 'price:usd' });
  assert.match(member, /<form class="comment-form"/);
  assert.match(member, /data-target="price:usd"/);
});

test('renderCommentList فقط برای نویسنده دکمهٔ حذف می‌گذارد', () => {
  const me = { id: 'u1', username: 'me', displayName: 'من' };
  const comments = [
    { id: 'c1', userId: 'u1', author: 'من', username: 'me', text: 'کامنت خودم', createdAt: NOW },
    { id: 'c2', userId: 'u2', author: 'دیگری', username: 'other', text: 'کامنت دیگری', createdAt: NOW }
  ];
  const html = renderCommentList(comments, me);
  assert.equal(html.match(/data-del-comment/g).length, 1);
  assert.match(html, /کامنت دیگری/);
  assert.match(renderCommentList([], me), /هنوز نظری ثبت نشده/);
});

test('ریل استوری‌ها', () => {
  const stories = [{
    agency: AGENCY_BY_ID.irna,
    items: [post],
    unseen: true, count: 1, nextExpiry: NOW + 1000
  }];
  const html = renderStoryRail(stories);
  assert.match(html, /data-story-index="0"/);
  assert.match(html, /class="story-ring "/, 'حلقهٔ گرادیانی برای استوری دیده‌نشده');
  assert.match(renderStoryRail([{ ...stories[0], unseen: false }]), /story-ring seen/);
  assert.match(renderStoryRail([]), /story-rail empty/);
});

test('صفحهٔ خبرگزاری: آواتار + سه آمار، بیو، دکمه‌ها، تب‌های آیکونی و گرید', () => {
  const html = renderProfile(AGENCY_BY_ID.mehr, {
    posts: [post], following: true, followers: 1234,
    counts: { posts: 1, stories: 2 }
  });
  assert.match(html, /خبرگزاری مهر/);
  assert.match(html, /profile-stats/);
  assert.equal(html.match(/<div><b>/g).length, 3, 'سه آمار: پست، دنبال‌کننده، استوری');
  assert.match(html, /btn btn-secondary btn-follow/, 'دنبال‌شده = دکمهٔ خاکستری');
  assert.match(html, /دنبال می‌کنید/);
  assert.match(html, /grid-cell/);
  assert.match(html, /۱٬۲۳۴|۱۲۳۴/);
  assert.equal(html.match(/data-ptab=/g).length, 3, 'سه تب آیکونی');
  assert.ok(html.includes(ICONS.grid()), 'تب گرید پست‌ها');
  assert.match(renderProfile(AGENCY_BY_ID.mehr, { posts: [], following: false }), /btn btn-primary btn-follow/, 'دنبال‌نشده = دکمهٔ آبی');
});

test('کارت و صفحهٔ قیمت', () => {
  const asset = {
    key: 'usd', name: 'دلار آمریکا', short: 'USD', group: 'fx', icon: '$',
    unitLabel: 'تومان', last: 231500, first: 230600, high: 231800, low: 230600,
    prev: 230600, change: 900, changePct: 0.39, time: NOW, source: 'ثروتمندی',
    sourceUrl: 'https://servatmandi.com/Entity/Summary/100000000001'
  };
  const card = renderPriceCard(asset, [{ t: NOW - 3600e3, v: 230600 }, { t: NOW, v: 231500 }]);
  assert.match(card, /href="#\/price\/usd"/);
  assert.match(card, /ثروتمندی/);
  assert.match(card, /<svg class="spark"/);
  assert.match(card, /class="mrow up"/);

  // بدون سری، اسپارک‌لاین از خود دارایی (بستهٔ آماده) رسم می‌شود
  const fromSpark = renderPriceCard({ ...asset, spark: [{ t: NOW - 60e3, v: 231000 }, { t: NOW, v: 231500 }] });
  assert.match(fromSpark, /<svg class="spark"/);

  const detail = renderPriceDetail(asset, [{ t: NOW - 3600e3, v: 230600 }, { t: NOW, v: 231500 }], {
    rangeId: '7d', comments: [], user: null, commentCount: 0
  });
  assert.match(detail, /chart-wrap/);
  assert.match(detail, /id="comments"/);
  assert.match(detail, /auth-gate/, 'کاربر مهمان نباید بتواند کامنت بگذارد');
  assert.match(detail, /data-comments-for="price:usd"/);
  assert.match(detail, /۷ روز|data-range="7d"/);

  const market = renderMarket({ assets: [asset], group: 'all', bundle: { generatedAt: NOW - 120e3, intervalMinutes: 30 } });
  assert.match(market, /بروزرسانی خودکار/);
  assert.match(market, /هر ۳۰ دقیقه/);
  assert.match(market, /data-pgroup="all"/);
});

test('مودال احراز هویت در دو حالت', () => {
  assert.match(renderAuthModal('login'), /ورود به حساب کاربری/);
  assert.match(renderAuthModal('login'), /class="wordmark"/, 'لوگوتایپ بالای فرم مثل صفحهٔ ورود اینستاگرام');
  assert.match(renderAuthModal('register'), /ثبت‌نام کنید/);
  assert.match(renderAuthModal('register'), /data-auth-form="register"/);
  assert.match(renderAuthModal('login', 'رمز اشتباه است'), /رمز اشتباه است/);
});

test('نتایج جست‌وجو', () => {
  const html = renderSearchResults({
    accounts: [AGENCY_BY_ID.zoomit],
    posts: [post],
    assets: [],
    tags: [{ name: 'اقتصاد', count: 4 }],
    total: 3
  });
  assert.match(html, /خبرگزاری‌ها/);
  assert.match(html, /#اقتصاد/);
  assert.match(renderSearchResults({ total: 0, accounts: [], posts: [], assets: [], tags: [] }), /نتیجه‌ای پیدا نشد/);
});

test('اکسپلور و ریلز', () => {
  assert.match(renderExplore([post, { ...post, id: 'b' }]), /explore-grid/);
  assert.match(renderExplore([]), /چیزی برای نمایش نیست/);
  const reel = renderReel(post, { index: 0, total: 5 });
  assert.match(reel, /data-reel="irna:abc"/);
  assert.match(reel, /reel-rail/);
  assert.match(reel, /follow-pill/);
  assert.ok(reel.includes(ICONS.heart()) && reel.includes(ICONS.comment()) && reel.includes(ICONS.share()), 'ریل عمودی اکشن‌ها');
});

test('جزءهای پایه', () => {
  assert.match(avatar({ name: 'ایرنا', color: '#22c55e' }, { size: 50 }), /--size:50px/);
  assert.match(avatar({ name: 'ایرنا' }, { hasStory: true, unseen: true }), /avatar ringed/);
  assert.match(avatar({ name: 'ایرنا' }, { hasStory: true, seen: true }), /story-ring seen/);
  assert.match(followButton(true, 'irna'), /btn-secondary/);
  assert.match(followButton(false, 'irna'), /btn-primary/);
  assert.match(followButton(false, 'irna', { variant: 'text' }), /txt-btn/);
  assert.match(icon('home', { active: true }), /<svg class="ico/);
  assert.equal(icon('nope'), '');
});

test('صفحهٔ جزئیات پست تاریخ دقیق و آرشیو را نشان می‌دهد', () => {
  const html = renderPostDetail(post, {});
  assert.match(html, /۱۴۰۵\/۰۶\/۳۰ - ۱۲:۰۰/);
  assert.match(html, /آرشیو/);
  assert.match(html, /comments-wrap/);
});

test('ناوبری: دقیقاً پنج آیکون اینستاگرام در موبایل (خانه، جست‌وجو، بازار، ریلز، پروفایل)', () => {
  const mobile = NAV_ITEMS.filter((it) => !it.desktop).map((it) => it.route);
  assert.deepEqual(mobile, ['home', 'search', 'prices', 'reels', 'me']);
  const html = renderNav('home', { user: null });
  assert.ok(html.includes(ICONS.homeFill()), 'آیکون فعال پرشده است');
  assert.ok(html.includes(ICONS.search()), 'آیکون غیرفعال خطی است');
  assert.match(html, /class="nav-item active" href="#\/" data-route="home"/);
  assert.match(html, /nav-brand/, 'لوگوتایپ در نوار کناری دسکتاپ');
  assert.match(html, /data-desktop/, 'آیتم‌های اضافی فقط در دسکتاپ');
  assert.match(renderNav('me', { user: { username: 'sara', displayName: 'سارا' } }), /nav-ava/);
});

test('نوار بالا: خانه = لوگوتایپ + فلش + قلب + پیام؛ صفحات دیگر = دکمهٔ برگشت + عنوان', () => {
  const home = renderTopbar('home');
  assert.match(home, /class="wordmark">Rasad</);
  assert.ok(home.includes(ICONS.chevronDown()), 'فلش کنار لوگوتایپ');
  assert.ok(home.includes(ICONS.heart()), 'اعلان‌ها');
  assert.ok(home.includes(ICONS.share()), 'گفتگوها');
  assert.match(home, /href="#\/activity"/);
  assert.ok(!home.includes('data-back'));

  const prices = renderTopbar('prices', { title: 'بازار' });
  assert.match(prices, /data-back/);
  assert.match(prices, /بازار/);
  assert.match(renderTopbar('search', { q: 'دلار' }), /id="searchInput"[^>]*value="دلار"/);
  assert.match(renderTopbar('agency', { handle: 'irna' }), /class="handle">irna/);
});

test('منوی لوگوتایپ، شیت و فعالیت', () => {
  const drop = renderBrandMenu({ onlyFollowing: true, bundle: { generatedAt: NOW - 60e3, intervalMinutes: 30 } });
  assert.match(drop, /data-feed-mode="following"/);
  assert.match(drop, /class="on" data-feed-mode="following"/);
  assert.match(drop, /هر ۳۰ دقیقه/);

  const sheet = renderSheet([{ label: 'ذخیره', ico: 'bookmark', action: 'save', data: { id: 'x' } }, 'sep', { label: 'حذف', danger: true, action: 'del' }]);
  assert.match(sheet, /data-sheet-action="save" data-id="x"/);
  assert.match(sheet, /sheet-sep/);
  assert.match(sheet, /class="danger"/);

  const act = renderActivity([
    { type: 'post', post, at: NOW - 1000 },
    { type: 'price', asset: { key: 'usd', name: 'دلار', icon: '$', changePct: 1.5, change: 3000, last: 231500, unitLabel: 'تومان' }, at: NOW - 2000 }
  ]);
  assert.match(act, /امروز/);
  assert.match(act, /href="#\/price\/usd"/);
  assert.match(renderArchiveDays([{ key: '1405-06-30', label: 'دوشنبه ۳۰ شهریور ۱۴۰۵', count: 4 }]), /href="#\/archive\/1405-06-30"/);
});
