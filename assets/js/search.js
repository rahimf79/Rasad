/** جست‌وجو به سبک اینستاگرام: حساب‌ها، پست‌ها، قیمت‌ها و هشتگ‌ها */

const norm = (s) => String(s || '').toLowerCase().replace(/\u200c/g, ' ').replace(/ي/g, 'ی').replace(/ك/g, 'ک').trim();

const scorePost = (p, q) => {
  const t = norm(p.title), d = norm(p.desc), s = norm(p.sourceName);
  let sc = 0;
  if (t.startsWith(q)) sc += 6;
  if (t.includes(q)) sc += 4;
  if (s.includes(q)) sc += 3;
  if (d.includes(q)) sc += 1;
  if ((p.hashtags || []).some((h) => norm(h) === q)) sc += 5;
  // تازه‌ترها کمی بالاتر
  const ageDays = (Date.now() - (p.date || 0)) / 864e5;
  sc += Math.max(0, 1 - ageDays / 14);
  return sc;
};

/**
 * @param {object} args {q, posts, agencies, assets, limit}
 * @returns {{accounts, posts, assets, tags, total}}
 */
export function searchAll({ q, posts = [], agencies = [], assets = [], limit = 24 }) {
  const needle = norm(q);
  if (!needle) return { accounts: [], posts: [], assets: [], tags: [], total: 0 };

  const accounts = agencies
    .map((a) => {
      let sc = 0;
      if (norm(a.handle).startsWith(needle)) sc += 6;
      if (norm(a.name).startsWith(needle)) sc += 6;
      if (norm(a.name).includes(needle)) sc += 4;
      if (norm(a.full).includes(needle)) sc += 2;
      if (norm(a.bio).includes(needle)) sc += 1;
      if (norm(a.cat).includes(needle)) sc += 1;
      return { ...a, score: sc };
    })
    .filter((a) => a.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  const matchedPosts = posts
    .map((p) => ({ post: p, score: scorePost(p, needle) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const matchedAssets = assets
    .filter((a) => norm(a.name).includes(needle) || norm(a.short || '').includes(needle) || norm(a.group).includes(needle))
    .slice(0, 8);

  const tagCounts = new Map();
  for (const p of posts) for (const t of p.hashtags || []) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
  const tags = [...tagCounts.entries()]
    .filter(([t]) => norm(t).includes(needle))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => ({ name, count }));

  return {
    accounts,
    posts: matchedPosts.map((x) => x.post),
    assets: matchedAssets,
    tags,
    total: accounts.length + matchedPosts.length + matchedAssets.length + tags.length
  };
}

/** مدیریت «جست‌وجوهای اخیر» به صورت خالص */
export function pushRecent(list = [], term, max = 8) {
  const t = String(term || '').trim();
  if (!t) return list;
  return [t, ...list.filter((x) => x !== t)].slice(0, max);
}
