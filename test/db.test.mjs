import test from 'node:test';
import assert from 'node:assert/strict';

import { Store, createMemoryBackend, AuthError } from '../assets/js/db.js';

const DAY = 864e5;
const NOW = Date.UTC(2026, 8, 21, 12, 0, 0);
const newStore = () => new Store(createMemoryBackend(), { now: () => NOW });

const post = (id, over = {}) => ({
  id, title: 'عنوان ' + id, desc: 'توضیح', link: 'https://x/' + id,
  sourceId: 'irna', sourceName: 'ایرنا', sourceHandle: 'irna', sourceColor: '#22c55e',
  date: NOW - 3600e3, topic: 'اقتصاد', hashtags: ['اقتصاد'], ...over
});

test('ثبت‌نام، ورود و خروج', async () => {
  const db = newStore();
  const u = await db.register({ username: 'Sara.dev', password: 'secret123', displayName: 'سارا' });
  assert.equal(u.username, 'sara.dev', 'نام کاربری کوچک می‌شود');
  assert.ok(u.hash && u.salt);
  assert.notEqual(u.hash, 'secret123');

  assert.deepEqual((await db.currentUser()).id, u.id);
  await db.logout();
  assert.equal(await db.currentUser(), null);

  const again = await db.login('sara.dev', 'secret123');
  assert.equal(again.id, u.id);
  await assert.rejects(() => db.login('sara.dev', 'wrong'), /رمز عبور اشتباه/);
  await assert.rejects(() => db.login('nobody', 'x'), /پیدا نشد/);
});

test('اعتبارسنجی نام کاربری و رمز', async () => {
  const db = newStore();
  await assert.rejects(() => db.register({ username: 'ab', password: 'secret123' }), /نام کاربری/);
  await assert.rejects(() => db.register({ username: 'valid_user', password: '123' }), /رمز عبور/);
  await db.register({ username: 'valid_user', password: 'secret123' });
  await assert.rejects(() => db.register({ username: 'valid_user', password: 'secret123' }), /قبلاً ثبت شده/);
});

test('publicUser هش و نمک را لو نمی‌دهد', async () => {
  const db = newStore();
  const u = await db.register({ username: 'ali123', password: 'secret123' });
  const pub = Store.publicUser(u);
  assert.equal(pub.hash, undefined);
  assert.equal(pub.salt, undefined);
  assert.equal(pub.username, 'ali123');
});

test('کامنت بدون حساب کاربری ممنوع است', async () => {
  const db = newStore();
  await assert.rejects(() => db.addComment({ targetId: 'price:usd', text: 'سلام' }), AuthError);
  await db.register({ username: 'nima', password: 'secret123' });
  const c = await db.addComment({ targetId: 'price:usd', text: ' دلار گران شد ' });
  assert.equal(c.text, 'دلار گران شد');
  assert.equal(c.username, 'nima');
  const list = await db.listComments('price:usd');
  assert.equal(list.length, 1);
  assert.equal(await db.countComments('price:gold18'), 0);
});

test('کامنت خالی یا خیلی طولانی رد می‌شود', async () => {
  const db = newStore();
  await db.register({ username: 'reza', password: 'secret123' });
  await assert.rejects(() => db.addComment({ targetId: 't', text: '   ' }), /خالی/);
  await assert.rejects(() => db.addComment({ targetId: 't', text: 'a'.repeat(1600) }), /طولانی/);
});

test('فقط نویسنده می‌تواند کامنت را حذف کند', async () => {
  const db = newStore();
  await db.register({ username: 'owner1', password: 'secret123' });
  const c = await db.addComment({ targetId: 't', text: 'کامنت من' });
  await db.logout();
  await db.register({ username: 'other1', password: 'secret123' });
  await assert.rejects(() => db.deleteComment(c.id), /نویسنده/);
  await db.logout();
  await db.login('owner1', 'secret123');
  assert.equal(await db.deleteComment(c.id), true);
  assert.equal(await db.countComments('t'), 0);
});

test('دنبال کردن خبرگزاری‌ها نیاز به ورود دارد و toggle است', async () => {
  const db = newStore();
  await assert.rejects(() => db.toggleFollow('irna'), AuthError);
  await db.register({ username: 'foll0wer', password: 'secret123' });
  assert.deepEqual(await db.toggleFollow('irna'), ['irna']);
  assert.equal(await db.isFollowing('irna'), true);
  assert.deepEqual(await db.toggleFollow('mehr'), ['irna', 'mehr']);
  assert.deepEqual(await db.toggleFollow('irna'), ['mehr']);
});

test('لایک و ذخیره فقط برای کاربر واردشده', async () => {
  const db = newStore();
  await assert.rejects(() => db.toggleLike('p1'), AuthError);
  await db.register({ username: 'liker1', password: 'secret123' });
  assert.equal(await db.toggleLike('p1'), true);
  assert.deepEqual(await db.likedIds(), ['p1']);
  assert.equal(await db.toggleLike('p1'), false);
  assert.deepEqual(await db.likedIds(), []);
});

test('آرشیو پست‌ها: درج بدون تکراری و پرس‌وجو با فیلتر', async () => {
  const db = newStore();
  const first = await db.putPosts([post('a'), post('b', { sourceId: 'mehr', topic: 'ورزش' })]);
  assert.equal(first.added, 2);
  const again = await db.putPosts([post('a', { title: 'ویرایش' })]);
  assert.equal(again.added, 0);
  assert.equal(again.updated, 1);
  assert.equal((await db.getPost('a')).title, 'ویرایش');

  assert.equal(await db.countPosts(), 2);
  assert.equal(await db.countPosts('mehr'), 1);
  assert.equal((await db.queryPosts({ sourceId: 'mehr' })).length, 1);
  assert.equal((await db.queryPosts({ topic: 'ورزش' })).length, 1);
  assert.equal((await db.queryPosts({ q: 'ویرایش' })).length, 1);
  assert.equal((await db.queryPosts({ q: 'عنوان b' })).length, 1);
  assert.equal((await db.queryPosts({ limit: 1 })).length, 1);
});

test('پاک‌سازی اخبار قدیمی (پست‌ها انقضا ندارند، آرشیو سبک می‌ماند)', async () => {
  const db = newStore();
  await db.putPosts([
    post('fresh', { date: NOW - DAY }),
    post('old', { date: NOW - 400 * DAY })
  ]);
  const removed = await db.pruneNews(120, NOW);
  assert.equal(removed, 1);
  assert.equal(await db.getPost('old'), undefined);
  assert.ok(await db.getPost('fresh'));
});

test('سری قیمت‌ها: جایگزینی نقطهٔ هم‌زمان و برش بازه', async () => {
  const db = newStore();
  const t0 = NOW - 10 * DAY;
  const added1 = await db.putPricePoints('usd', [
    { t: t0, v: 2300000 }, { t: t0 + DAY, v: 2310000 }
  ]);
  assert.equal(added1, 2);
  const added2 = await db.putPricePoints('usd', [{ t: t0 + DAY, v: 2320000 }]);
  assert.equal(added2, 0, 'نقطهٔ هم‌زمان جایگزین می‌شود نه افزوده');

  const all = await db.getPriceHistory('usd');
  assert.equal(all.length, 2);
  assert.equal(all[1].v, 2320000);

  const slice = await db.getPriceHistory('usd', { from: t0 + DAY });
  assert.equal(slice.length, 1);

  const pruned = await db.prunePrices(5, NOW);
  assert.equal(pruned, 1);
  assert.equal((await db.getPriceHistory('usd')).length, 0);
});

test('پشتیبان‌گیری و بازیابی', async () => {
  const a = newStore();
  await a.register({ username: 'backup1', password: 'secret123' });
  await a.putPosts([post('x')]);
  await a.addComment({ targetId: 'x', text: 'کامنت' });
  const dump = await a.exportAll();

  const b = newStore();
  const n = await b.importAll(dump);
  assert.ok(n >= 3);
  assert.equal(await b.countPosts(), 1);
  assert.equal(await b.countComments('x'), 1);
});

test('آمار پایگاه داده', async () => {
  const db = newStore();
  await db.register({ username: 'stat1', password: 'secret123' });
  await db.putPosts([post('p1'), post('p2')]);
  await db.putPricePoints('usd', [{ t: NOW, v: 1 }]);
  const s = await db.stats();
  assert.equal(s.users, 1);
  assert.equal(s.posts, 2);
  assert.equal(s.assets, 1);
  assert.equal(s.pricePoints, 1);
});
