import test from 'node:test';
import assert from 'node:assert/strict';

import {
  renderPost, renderPostDetail, renderCommentBox, renderCommentList, renderStoryRail,
  renderProfile, renderPriceCard, renderPriceDetail, renderAuthModal, renderSearchResults,
  renderExplore, renderReel, avatar, followButton
} from '../assets/js/render.js';
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

test('renderPost وضعیت لایک و کامنت را نشان می‌دهد', () => {
  const html = renderPost(post, {
    liked: true, saved: true, likeCount: 12, commentCount: 3,
    comments: [{ author: 'سارا', text: 'عالی بود' }]
  });
  assert.match(html, /class="act on"/);
  assert.match(html, /🔖/);
  assert.match(html, /عالی بود/);
  assert.match(html, /دیدن همهٔ/);
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
  assert.match(renderCommentList([], me), /اولین کامنت/);
});

test('ریل استوری‌ها', () => {
  const stories = [{
    agency: AGENCY_BY_ID.irna,
    items: [post],
    unseen: true, count: 1, nextExpiry: NOW + 1000
  }];
  const html = renderStoryRail(stories);
  assert.match(html, /data-story-index="0"/);
  assert.match(html, /story-ring unseen/);
  assert.match(renderStoryRail([]), /استوری جدیدی منتشر نشده/);
});

test('صفحهٔ خبرگزاری با آمار و گرید پست‌ها', () => {
  const html = renderProfile(AGENCY_BY_ID.mehr, {
    posts: [post], following: true, followers: 1234,
    counts: { posts: 1, stories: 2 }
  });
  assert.match(html, /خبرگزاری مهر/);
  assert.match(html, /دنبال شده/);
  assert.match(html, /grid-cell/);
  assert.match(html, /۱٬۲۳۴|۱۲۳۴/);
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

  const detail = renderPriceDetail(asset, [{ t: NOW - 3600e3, v: 230600 }, { t: NOW, v: 231500 }], {
    rangeId: '7d', comments: [], user: null, commentCount: 0
  });
  assert.match(detail, /chart-wrap/);
  assert.match(detail, /id="comments"/);
  assert.match(detail, /auth-gate/, 'کاربر مهمان نباید بتواند کامنت بگذارد');
  assert.match(detail, /data-comments-for="price:usd"/);
  assert.match(detail, /۷ روز|data-range="7d"/);
});

test('مودال احراز هویت در دو حالت', () => {
  assert.match(renderAuthModal('login'), /ورود به حساب کاربری/);
  assert.match(renderAuthModal('register'), /ساخت حساب کاربری/);
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
  assert.match(reel, /از ۵/);
});

test('جزءهای پایه', () => {
  assert.match(avatar({ name: 'ایرنا', color: '#22c55e' }, { size: 50 }), /--size:50px/);
  assert.match(avatar({ name: 'ایرنا' }, { hasStory: true, unseen: true }), /story-ring unseen/);
  assert.match(followButton(true, 'irna'), /btn-ghost/);
  assert.match(followButton(false, 'irna'), /btn-primary/);
});

test('صفحهٔ جزئیات پست تاریخ دقیق و آرشیو را نشان می‌دهد', () => {
  const html = renderPostDetail(post, {});
  assert.match(html, /۱۴۰۵\/۰۶\/۳۰ - ۱۲:۰۰/);
  assert.match(html, /آرشیو/);
});
