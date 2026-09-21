import test from 'node:test';
import assert from 'node:assert/strict';

import { buildStories, isStory, storyTimeLeft, formatRemaining, detectTopic, makePostId, normalizeItem } from '../assets/js/posts.js';
import { APP, AGENCY_BY_ID } from '../assets/js/config.js';

const NOW = Date.UTC(2026, 8, 21, 12, 0, 0);
const HOUR = 3600e3;
const mk = (id, sourceId, ageMs, over = {}) => ({
  id, sourceId, title: 'خبر ' + id, desc: '', date: NOW - ageMs, topic: 'اقتصاد', ...over
});

test('استوری دقیقاً ۲۴ ساعت زنده است', () => {
  assert.equal(isStory(mk('a', 'irna', 23 * HOUR), NOW), true);
  assert.equal(isStory(mk('b', 'irna', APP.STORY_TTL_MS - 1), NOW), true);
  assert.equal(isStory(mk('c', 'irna', APP.STORY_TTL_MS + 1), NOW), false);
  assert.equal(isStory(mk('d', 'irna', 40 * HOUR), NOW), false);
});

test('خبر آینده استوری نیست', () => {
  assert.equal(isStory(mk('f', 'irna', -HOUR), NOW), false);
});

test('زمان باقی‌ماندهٔ استوری', () => {
  assert.equal(storyTimeLeft(mk('a', 'irna', 10 * HOUR), NOW), 14 * HOUR);
  assert.equal(storyTimeLeft(mk('b', 'irna', 30 * HOUR), NOW), 0);
  assert.match(formatRemaining(3 * HOUR + 25 * 60000), /۳ ساعت و ۲۵ دقیقه/);
  assert.match(formatRemaining(25 * 60000), /۲۵ دقیقه/);
});

test('استوری‌ها بر اساس خبرگزاری گروه می‌شوند و تازه‌ها اول می‌آیند', () => {
  const posts = [
    mk('1', 'irna', 20 * HOUR),
    mk('2', 'irna', 2 * HOUR),
    mk('3', 'mehr', 1 * HOUR),
    mk('4', 'irna', 30 * HOUR) // قدیمی‌تر از ۲۴ ساعت → فقط پست
  ];
  const stories = buildStories(posts, { now: NOW });
  assert.equal(stories.length, 2);
  const irna = stories.find((s) => s.agency.id === 'irna');
  assert.equal(irna.count, 2, 'خبر ۳۰ ساعته استوری نیست');
  assert.deepEqual(irna.items.map((p) => p.id), ['1', '2'], 'ترتیب زمانی صعودی برای پخش');
  assert.equal(stories[0].agency.id, 'mehr', 'تازه‌ترین استوری اول صف');
});

test('دیده‌شده/دیده‌نشده', () => {
  const posts = [mk('1', 'irna', HOUR), mk('2', 'irna', 2 * HOUR)];
  const unseen = buildStories(posts, { now: NOW });
  assert.equal(unseen[0].unseen, true);
  const seen = buildStories(posts, { now: NOW, seen: ['1', '2'] });
  assert.equal(seen[0].unseen, false);
});

test('خبرگزاری ناشناخته حذف می‌شود', () => {
  const stories = buildStories([mk('x', 'ghost_agency', HOUR)], { now: NOW });
  assert.equal(stories.length, 0);
});

test('تشخیص موضوع بر اساس کلیدواژه', () => {
  assert.equal(detectTopic('قیمت نفت برنت و گاز طبیعی افزایش یافت', ''), 'انرژی');
  assert.equal(detectTopic('ایران خودرو و سایپا قیمت پژو و پراید را اعلام کردند', ''), 'خودرو');
  assert.equal(detectTopic('هوش مصنوعی و گوشی موبایل', ''), 'فناوری');
  assert.equal(detectTopic('خبری بدون کلیدواژه', ''), 'ایران');
});

test('شناسهٔ پایدار پست', () => {
  assert.equal(makePostId('irna', 'https://x/a?utm=1'), makePostId('irna', 'https://x/a'));
  assert.notEqual(makePostId('irna', 'https://x/a'), makePostId('mehr', 'https://x/a'));
});

test('نرمال‌سازی آیتم RSS به پست', () => {
  const ag = AGENCY_BY_ID.irna;
  const p = normalizeItem({
    title: '<b>قیمت دلار</b> افزایش یافت',
    description: '<p>در بازار آزاد تهران قیمت دلار و ارز رشد کرد</p>',
    content: '<p>متن کامل <img src="https://img/x.jpg"></p>',
    link: 'https://irna.ir/1',
    pubDate: new Date(NOW - 2 * HOUR).toUTCString()
  }, ag, NOW);

  assert.equal(p.title, 'قیمت دلار افزایش یافت');
  assert.equal(p.sourceId, 'irna');
  assert.equal(p.sourceHandle, 'irna');
  assert.equal(p.date, NOW - 2 * HOUR);
  assert.equal(p.topic, 'اقتصاد');
  assert.match(p.exactDate, /^[۰-۹]{4}\/[۰-۹]{2}\/[۰-۹]{2} - /);
  assert.ok(p.hashtags.includes('اقتصاد'));
  assert.equal(p.id.startsWith('irna:'), true);
});
