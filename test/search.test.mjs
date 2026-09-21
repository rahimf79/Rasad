import test from 'node:test';
import assert from 'node:assert/strict';

import { searchAll, pushRecent } from '../assets/js/search.js';
import { AGENCIES } from '../assets/js/config.js';

const NOW = Date.now();
const posts = [
  { id: 'p1', title: 'قیمت دلار در بازار آزاد افزایش یافت', desc: 'ارز و طلا', sourceName: 'ایرنا', date: NOW, hashtags: ['اقتصاد'] },
  { id: 'p2', title: 'رونمایی از گوشی هوش مصنوعی', desc: 'فناوری', sourceName: 'زومیت', date: NOW - 864e5, hashtags: ['فناوری'] },
  { id: 'p3', title: 'نفت برنت و گاز طبیعی', desc: 'انرژی', sourceName: 'شانا', date: NOW - 2 * 864e5, hashtags: ['انرژی'] }
];
const assets = [
  { key: 'usd', name: 'دلار آمریکا', short: 'USD', group: 'fx', last: 231500, unitLabel: 'تومان' },
  { key: 'brent', name: 'نفت خام برنت', short: 'BRENT', group: 'energy', last: 70, unitLabel: 'دلار' }
];

test('جست‌وجوی خالی نتیجه نمی‌دهد', () => {
  const r = searchAll({ q: '', posts, agencies: AGENCIES, assets });
  assert.equal(r.total, 0);
});

test('پیدا کردن خبرگزاری با نام و هندل', () => {
  const r = searchAll({ q: 'ایرنا', posts, agencies: AGENCIES, assets });
  assert.ok(r.accounts.some((a) => a.id === 'irna'));
  const byHandle = searchAll({ q: 'irna', posts, agencies: AGENCIES, assets });
  assert.ok(byHandle.accounts.some((a) => a.id === 'irna'));
});

test('پیدا کردن پست بر اساس عنوان', () => {
  const r = searchAll({ q: 'دلار', posts, agencies: AGENCIES, assets });
  assert.equal(r.posts[0].id, 'p1');
});

test('پیدا کردن دارایی قیمت', () => {
  const r = searchAll({ q: 'نفت', posts, agencies: AGENCIES, assets });
  assert.ok(r.assets.some((a) => a.key === 'brent'));
});

test('پیدا کردن هشتگ موضوعی', () => {
  const r = searchAll({ q: 'انرژی', posts, agencies: AGENCIES, assets });
  assert.ok(r.tags.some((t) => t.name === 'انرژی'));
});

test('نیم‌فاصله و ی/ک عربی نرمال می‌شود', () => {
  const r = searchAll({ q: 'ارزش طلا', posts: [{ ...posts[0], title: 'ارزش طلا رشد کرد' }], agencies: [], assets: [] });
  assert.equal(r.posts.length, 1);
});

test('محدودسازی نتایج', () => {
  const many = Array.from({ length: 60 }, (_, i) => ({
    id: 'm' + i, title: 'خبر دلار ' + i, desc: '', sourceName: 'x', date: NOW - i * 1000, hashtags: []
  }));
  const r = searchAll({ q: 'دلار', posts: many, agencies: [], assets: [], limit: 5 });
  assert.equal(r.posts.length, 5);
});

test('جست‌وجوهای اخیر بدون تکرار و با سقف', () => {
  let list = [];
  list = pushRecent(list, 'دلار');
  list = pushRecent(list, 'طلا');
  list = pushRecent(list, 'دلار');
  assert.deepEqual(list, ['دلار', 'طلا']);
  for (let i = 0; i < 12; i++) list = pushRecent(list, 'q' + i, 8);
  assert.equal(list.length, 8);
  assert.deepEqual(pushRecent(['a'], '  '), ['a']);
});
