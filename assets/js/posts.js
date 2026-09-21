/** نرمال‌سازی آیتم‌های خبری به «پست» و تشخیص موضوع */

import { TOPICS, APP, AGENCY_BY_ID } from './config.js';
import { stripHtml, firstImage, esc } from './lib/util.js';
import { formatJalali } from './lib/jalali.js';

/** شناسهٔ پایدار پست: با اجرای مجدد جمع‌آوری، پست تکراری ساخته نمی‌شود */
export function makePostId(sourceId, link, title) {
  const basis = String(link || title || '').trim().replace(/[#?].*$/, '');
  let h = 0;
  for (let i = 0; i < basis.length; i++) h = (h * 131 + basis.charCodeAt(i)) >>> 0;
  return `${sourceId}:${h.toString(36)}`;
}

/** تشخیص موضوع بر اساس کلیدواژه */
export function detectTopic(title, desc, fallback = 'ایران') {
  const text = `${title} ${desc}`.toLowerCase();
  let best = fallback;
  let bestScore = 0;
  for (const [topic, words] of Object.entries(TOPICS)) {
    const score = words.reduce((s, w) => s + (text.includes(w.toLowerCase()) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; best = topic; }
  }
  return best;
}

/** استخراج هشتگ‌های موضوعی برای جست‌وجو */
export function hashtagsFor(post) {
  const tags = [post.topic];
  const text = `${post.title} ${post.desc}`;
  for (const t of Object.keys(TOPICS)) {
    if (t !== post.topic && TOPICS[t].some((w) => text.includes(w))) tags.push(t);
  }
  return [...new Set(tags)].slice(0, 3);
}

/**
 * تبدیل یک آیتم RSS به پست رصد.
 * @param {object} it   {title, description, content, link, pubDate, thumbnail}
 * @param {object} ag   رکورد خبرگزاری از config.AGENCIES
 */
export function normalizeItem(it, ag, now = Date.now()) {
  const title = stripHtml(it.title).slice(0, 400);
  const desc = stripHtml(it.description || it.content).slice(0, 1200);
  const content = stripHtml(it.content || it.description || '');
  const pub = it.pubDate ? new Date(it.pubDate) : new Date(now);
  const date = isNaN(pub) ? now : pub.getTime();
  const img = it.thumbnail || firstImage(it.content || it.description || '') || '';

  const post = {
    id: makePostId(ag.id, it.link, title),
    title,
    desc,
    content: content.slice(0, 4000),
    link: String(it.link || '').trim(),
    sourceId: ag.id,
    sourceName: ag.name,
    sourceFull: ag.full,
    sourceHandle: ag.handle,
    sourceColor: ag.color,
    date,
    exactDate: formatJalali(date, { seconds: true }),
    exactDateShort: formatJalali(date),
    collectedAt: now,
    img,
    topic: detectTopic(title, desc, 'ایران')
  };
  post.hashtags = hashtagsFor(post);
  return post;
}

/** استوری = خبر منتشرشده در ۲۴ ساعت گذشته (پست‌ها انقضا ندارند) */
export function isStory(post, now = Date.now(), ttl = APP.STORY_TTL_MS) {
  return now - post.date < ttl && now - post.date >= 0;
}

/** زمان باقی‌ماندهٔ استوری (میلی‌ثانیه) */
export function storyTimeLeft(post, now = Date.now(), ttl = APP.STORY_TTL_MS) {
  return Math.max(0, ttl - (now - post.date));
}

export const formatRemaining = (ms) => {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
  return h > 0 ? `${fa(h)} ساعت و ${fa(m)} دقیقه` : `${fa(m)} دقیقه`;
};

/**
 * ساخت ردیف استوری‌ها به سبک اینستاگرام.
 * خروجی: [{agency, items:[...], unseen, nextExpiry}] مرتب‌شده بر اساس تازه‌ترین.
 */
export function buildStories(posts, { agencies = Object.values(AGENCY_BY_ID), now = Date.now(), ttl = APP.STORY_TTL_MS, seen = [], perAgency = 12 } = {}) {
  const byAgency = new Map();
  for (const p of posts) {
    if (!isStory(p, now, ttl)) continue;
    const list = byAgency.get(p.sourceId) || [];
    list.push(p);
    byAgency.set(p.sourceId, list);
  }

  const out = [];
  for (const [sourceId, items] of byAgency) {
    const agency = agencies.find((a) => a.id === sourceId) || AGENCY_BY_ID[sourceId];
    if (!agency) continue;
    const sorted = items.sort((a, b) => a.date - b.date).slice(-perAgency);
    const keys = sorted.map((p) => p.id);
    const unseen = keys.some((k) => !seen.includes(k));
    out.push({
      agency,
      items: sorted,
      unseen,
      nextExpiry: Math.min(...sorted.map((p) => p.date + ttl)),
      count: sorted.length
    });
  }
  return out.sort((a, b) => Number(b.unseen) - Number(a.unseen) || b.nextExpiry - a.nextExpiry);
}
