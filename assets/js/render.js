/** قالب‌های رندر - همه توابع رشتهٔ HTML برمی‌گردانند و به DOM دست نمی‌زنند */

import { esc, nf, money, pct, dirCls, timeAgo, toFaDigits, gradientFor } from './lib/util.js';
import { formatJalali, formatJalaliLong } from './lib/jalali.js';
import { TOPIC_STYLE, APP } from './config.js';
import { storyTimeLeft, formatRemaining } from './posts.js';
import { priceChart, statsGrid, priceTimeline, rangeStats, RANGES, rangeById, sparkline as sparklineImpl } from './prices.js';

/* ------------------------------------------------------------------ */
/* اجزای پایه                                                          */
/* ------------------------------------------------------------------ */

export function avatar(entity, { size = 40, hasStory = false, unseen = false, seen = false } = {}) {
  const label = String(entity?.name || entity?.displayName || entity?.username || '؟').trim();
  const initial = label.charAt(0) || '؟';
  const bg = entity?.color || gradientFor(label);
  const ring = hasStory
    ? `<span class="story-ring ${unseen ? 'unseen' : ''} ${seen ? 'seen' : ''}"></span>`
    : '';
  return `<span class="avatar" style="--size:${size}px">
    ${ring}
    <span class="avatar-face" style="background:${bg.startsWith('linear') ? bg : `linear-gradient(135deg,${bg},${bg}cc)`}">${esc(initial)}</span>
  </span>`;
}

export function verifiedBadge(on) {
  return on ? `<svg class="verified" viewBox="0 0 24 24" aria-label="تأیید شده"><path fill="#3b82f6" d="M12 1.8l2.4 1.8 3-.2.9 2.9 2.5 1.6-1 2.8 1 2.8-2.5 1.6-.9 2.9-3-.2L12 22.2 9.6 20.4l-3 .2-.9-2.9L3.2 16l1-2.8-1-2.8L5.7 8.8l.9-2.9 3 .2z"/><path fill="#fff" d="M10.6 15.6l-3-3 1.4-1.4 1.6 1.6 4-4 1.4 1.4z"/></svg>` : '';
}

export function followButton(following, agencyId) {
  return `<button class="btn ${following ? 'btn-ghost' : 'btn-primary'} btn-follow" data-agency="${esc(agencyId)}">${following ? 'دنبال شده ✓' : 'دنبال کردن'}</button>`;
}

/* ------------------------------------------------------------------ */
/* استوری                                                              */
/* ------------------------------------------------------------------ */

export function renderStoryRail(stories, { now = Date.now() } = {}) {
  if (!stories.length) {
    return `<div class="story-rail empty">
      <div class="muted center small">در ۲۴ ساعت گذشته استوری جدیدی منتشر نشده. استوری‌ها خودکار ۲۴ ساعته هستند و بعد از آن فقط به‌صورت پست در آرشیو می‌مانند.</div>
    </div>`;
  }
  return `<div class="story-rail">${stories.map((s, i) => `
    <button class="story-item" data-story-index="${i}" title="${esc(s.agency.full)}">
      ${avatar(s.agency, { size: 62, hasStory: true, unseen: s.unseen })}
      <span class="story-name">${esc(s.agency.name)}</span>
      <span class="story-count">${esc(toFaDigits(s.count))} استوری</span>
    </button>`).join('')}</div>`;
}

export function renderStoryViewer(stories, index, itemIndex, { seen = [] } = {}) {
  const s = stories[index];
  if (!s) return '';
  const item = s.items[itemIndex] || s.items[0];
  const left = storyTimeLeft(item);
  const segments = s.items.map((it, i) => `<i class="seg ${i < itemIndex ? 'done' : ''} ${i === itemIndex ? 'active' : ''}"></i>`).join('');

  return `<div class="story-viewer">
    <div class="story-progress">${segments}</div>
    <div class="story-top">
      <a class="story-user" href="#/u/${esc(s.agency.handle)}">
        ${avatar(s.agency, { size: 36 })}
        <span>
          <b>${esc(s.agency.name)}</b>
          <small>${esc(item.exactDateShort)} · ${esc(timeAgo(item.date))}</small>
        </span>
      </a>
      <button class="icon-btn ghost" data-close-story aria-label="بستن">✕</button>
    </div>
    <div class="story-media" style="${item.img ? `background-image:url('${esc(item.img)}')` : `background:${gradientFor(item.title)}`}">
      ${item.img ? '' : `<div class="story-fallback"><h2>${esc(item.title)}</h2></div>`}
      <div class="story-shade"></div>
      <div class="story-caption">
        ${item.img ? `<h2>${esc(item.title)}</h2>` : ''}
        <p>${esc((item.desc || '').slice(0, 220))}</p>
      </div>
    </div>
    <div class="story-meta">
      <span class="pill live">⏳ ${esc(formatRemaining(left))} تا پایان استوری</span>
      <span class="pill">${esc(item.topic)}</span>
    </div>
    <div class="story-nav">
      <button class="story-tap left" data-story-prev aria-label="قبلی"></button>
      <button class="story-tap right" data-story-next aria-label="بعدی"></button>
    </div>
    <div class="story-actions">
      <a class="btn btn-primary" href="${esc(item.link)}" target="_blank" rel="noopener">خواندن خبر کامل ↗</a>
      <a class="btn btn-ghost" href="#/p/${esc(item.id)}">دیدن پست</a>
    </div>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* پست                                                                 */
/* ------------------------------------------------------------------ */

export function renderPost(post, ctx = {}) {
  const { liked = false, saved = false, likeCount = 0, commentCount = 0, following = false, comments = [] } = ctx;
  const agency = { name: post.sourceName, color: post.sourceColor, handle: post.sourceHandle };
  const topicClass = TOPIC_STYLE[post.topic] || '';
  const preview = comments.slice(-2);

  return `<article class="post glass" data-post="${esc(post.id)}">
    <header class="post-head">
      <a class="post-user" href="#/u/${esc(post.sourceHandle)}">
        ${avatar(agency, { size: 40 })}
        <span class="who">
          <b>${esc(post.sourceName)}${verifiedBadge(true)}</b>
          <small>${esc(timeAgo(post.date))} · <span class="mono" dir="ltr">${esc(post.exactDate)}</span></small>
        </span>
      </a>
      <div class="post-head-actions">
        ${followButton(following, post.sourceId)}
        <a class="icon-btn" href="#/p/${esc(post.id)}" title="جزئیات">⋯</a>
      </div>
    </header>

    <a class="post-media" href="#/p/${esc(post.id)}" style="${post.img ? `background-image:url('${esc(post.img)}')` : `background:${gradientFor(post.title)}`}">
      ${post.img ? '' : `<div class="media-fallback"><span class="topic-tag ${topicClass}">${esc(post.topic)}</span><h3>${esc(post.title)}</h3></div>`}
      ${post.img ? `<span class="topic-tag ${topicClass}">${esc(post.topic)}</span>` : ''}
    </a>

    <div class="post-actions">
      <button class="act ${liked ? 'on' : ''}" data-like="${esc(post.id)}" aria-label="پسندیدن">${liked ? '❤️' : '🤍'} <span>${esc(nf(likeCount))}</span></button>
      <a class="act" href="#/p/${esc(post.id)}">💬 <span>${esc(nf(commentCount))}</span></a>
      <button class="act" data-share="${esc(post.link)}">📤 <span>اشتراک</span></button>
      <button class="act save ${saved ? 'on' : ''}" data-save="${esc(post.id)}">${saved ? '🔖' : '📑'}</button>
    </div>

    <div class="post-body">
      <h3 class="post-title"><a href="#/p/${esc(post.id)}">${esc(post.title)}</a></h3>
      ${post.desc ? `<p class="post-desc">${esc(post.desc.slice(0, 240))}${post.desc.length > 240 ? '…' : ''}</p>` : ''}
      <div class="post-tags">${(post.hashtags || []).map((t) => `<a href="#/search?q=${encodeURIComponent(t)}">#${esc(t)}</a>`).join('')}</div>
      ${preview.length ? `<div class="post-comments">
        ${preview.map((c) => `<div class="cmt"><b>${esc(c.author)}</b> ${esc(c.text.slice(0, 120))}</div>`).join('')}
        ${commentCount > preview.length ? `<a class="more" href="#/p/${esc(post.id)}">دیدن همهٔ ${esc(nf(commentCount))} کامنت</a>` : ''}
      </div>` : ''}
      <div class="post-foot">
        <span class="src-pill">${esc(post.sourceFull)}</span>
        <a href="${esc(post.link)}" target="_blank" rel="noopener">منبع ↗</a>
      </div>
    </div>
  </article>`;
}

export function renderPostDetail(post, ctx = {}) {
  const { liked = false, saved = false, likeCount = 0, commentCount = 0, following = false } = ctx;
  const agency = { name: post.sourceName, color: post.sourceColor };
  return `<section class="detail">
    <header class="detail-head glass">
      <a class="post-user" href="#/u/${esc(post.sourceHandle)}">
        ${avatar(agency, { size: 46 })}
        <span class="who"><b>${esc(post.sourceName)}</b><small>${esc(post.sourceFull)}</small></span>
      </a>
      ${followButton(following, post.sourceId)}
    </header>

    <div class="detail-media" style="${post.img ? `background-image:url('${esc(post.img)}')` : `background:${gradientFor(post.title)}`}">
      ${post.img ? '' : `<div class="media-fallback"><h2>${esc(post.title)}</h2></div>`}
    </div>

    <div class="detail-body glass">
      <h1>${esc(post.title)}</h1>
      <div class="detail-meta">
        <span class="pill">${esc(post.topic)}</span>
        <span class="pill">📅 ${esc(formatJalaliLong(post.date))}</span>
        <span class="pill mono" dir="ltr">🕒 ${esc(post.exactDate)}</span>
        <span class="pill">🗂️ آرشیو: ${esc(formatJalali(post.collectedAt || post.date))}</span>
      </div>
      ${post.desc ? `<p class="lead">${esc(post.desc)}</p>` : ''}
      ${post.content && post.content !== post.desc ? `<div class="prose">${esc(post.content).replace(/\n/g, '<br>')}</div>` : ''}
      <div class="post-actions">
        <button class="act ${liked ? 'on' : ''}" data-like="${esc(post.id)}">${liked ? '❤️' : '🤍'} <span>${esc(nf(likeCount))}</span></button>
        <a class="act" href="#comments">💬 <span>${esc(nf(commentCount))}</span></a>
        <button class="act" data-share="${esc(post.link)}">📤 <span>اشتراک</span></button>
        <button class="act save ${saved ? 'on' : ''}" data-save="${esc(post.id)}">${saved ? '🔖' : '📑'}</button>
      </div>
      <div class="detail-links">
        <a class="btn btn-primary" href="${esc(post.link)}" target="_blank" rel="noopener">مشاهده در ${esc(post.sourceName)} ↗</a>
        <a class="btn btn-ghost" href="#/u/${esc(post.sourceHandle)}">صفحهٔ ${esc(post.sourceName)}</a>
      </div>
    </div>
  </section>`;
}

/* ------------------------------------------------------------------ */
/* صفحهٔ خبرگزاری (پروفایل)                                             */
/* ------------------------------------------------------------------ */

export function renderProfile(agency, { posts = [], following = false, storyCount = 0, tab = 'posts', followers = 0, counts = {} } = {}) {
  const tabs = [
    { id: 'posts', label: 'پست‌ها', icon: '▦' },
    { id: 'stories', label: 'استوری‌ها', icon: '◎' },
    { id: 'archive', label: 'آرشیو', icon: '🗂' }
  ];
  const list = tab === 'stories' ? posts.filter((p) => Date.now() - p.date < APP.STORY_TTL_MS) : posts;

  return `<section class="profile">
    <header class="profile-head glass">
      ${avatar(agency, { size: 92, hasStory: storyCount > 0, unseen: storyCount > 0 })}
      <div class="profile-id">
        <h1>${esc(agency.name)}${verifiedBadge(agency.verified)}</h1>
        <div class="handle">@${esc(agency.handle)} · ${esc(agency.cat)}</div>
        <p class="bio">${esc(agency.bio)}</p>
        <div class="profile-stats">
          <div><b>${esc(nf(counts.posts ?? list.length))}</b><span>پست</span></div>
          <div><b>${esc(nf(followers))}</b><span>دنبال‌کننده</span></div>
          <div><b>${esc(nf(counts.stories ?? storyCount))}</b><span>استوری فعال</span></div>
        </div>
        <div class="profile-actions">
          ${followButton(following, agency.id)}
          <a class="btn btn-ghost" href="${esc(agency.site)}" target="_blank" rel="noopener">سایت منبع ↗</a>
        </div>
      </div>
    </header>

    <nav class="profile-tabs">${tabs.map((t) => `<button class="tab ${tab === t.id ? 'active' : ''}" data-ptab="${t.id}">${t.icon} ${t.label}</button>`).join('')}</nav>

    ${tab === 'archive'
      ? `<div class="archive-note">آرشیو کامل با تاریخ دقیق انتشار. پست‌ها تاریخ انقضا ندارند و فقط بر اساس سیاست نگهداری (${esc(nf(APP.RETENTION.newsDays))} روز) پاک‌سازی می‌شوند.</div>`
      : ''}

    ${list.length
      ? `<div class="profile-grid">${list.map((p) => `
        <a class="grid-cell" href="#/p/${esc(p.id)}" style="${p.img ? `background-image:url('${esc(p.img)}')` : `background:${gradientFor(p.title)}`}">
          <span class="shade"></span>
          ${!p.img ? `<span class="grid-title">${esc(p.title)}</span>` : ''}
          <span class="grid-meta">${esc(p.exactDateShort)}</span>
        </a>`).join('')}</div>`
      : `<div class="muted center glass pad">هنوز پستی از این خبرگزاری جمع‌آوری نشده است.</div>`}
  </section>`;
}

/* ------------------------------------------------------------------ */
/* اکسپلور و ریلز                                                      */
/* ------------------------------------------------------------------ */

export function renderExplore(posts) {
  if (!posts.length) return '<div class="muted center glass pad">چیزی برای نمایش نیست.</div>';
  return `<div class="explore-grid">${posts.map((p, i) => {
    const big = i % 10 === 2;
    return `<a class="exp-cell ${big ? 'big' : ''}" href="#/p/${esc(p.id)}" style="${p.img ? `background-image:url('${esc(p.img)}')` : `background:${gradientFor(p.title)}`}">
      <span class="shade"></span>
      ${!p.img ? `<span class="exp-title">${esc(p.title)}</span>` : ''}
      <span class="exp-foot"><b>${esc(p.sourceName)}</b> · ${esc(timeAgo(p.date))}</span>
    </a>`;
  }).join('')}</div>`;
}

export function renderReel(post, ctx = {}) {
  const { liked = false, likeCount = 0, commentCount = 0, index = 0, total = 0 } = ctx;
  return `<section class="reel" data-reel="${esc(post.id)}">
    <div class="reel-bg" style="${post.img ? `background-image:url('${esc(post.img)}')` : `background:${gradientFor(post.title)}`}"></div>
    <div class="reel-shade"></div>
    <div class="reel-body">
      <a class="reel-user" href="#/u/${esc(post.sourceHandle)}">
        ${avatar({ name: post.sourceName, color: post.sourceColor }, { size: 38 })}
        <b>${esc(post.sourceName)}</b>
        <small>${esc(timeAgo(post.date))}</small>
      </a>
      <h2>${esc(post.title)}</h2>
      <p>${esc((post.desc || '').slice(0, 200))}</p>
      <div class="reel-tags">
        <span class="pill">${esc(post.topic)}</span>
        <span class="pill mono" dir="ltr">${esc(post.exactDate)}</span>
      </div>
      <a class="btn btn-primary sm" href="${esc(post.link)}" target="_blank" rel="noopener">خواندن کامل ↗</a>
    </div>
    <div class="reel-rail">
      <button class="rail-btn ${liked ? 'on' : ''}" data-like="${esc(post.id)}"><span>${liked ? '❤️' : '🤍'}</span><small>${esc(nf(likeCount))}</small></button>
      <a class="rail-btn" href="#/p/${esc(post.id)}"><span>💬</span><small>${esc(nf(commentCount))}</small></a>
      <button class="rail-btn" data-share="${esc(post.link)}"><span>📤</span><small>ارسال</small></button>
      <div class="rail-count"><b>${esc(nf(index + 1))}</b><small>از ${esc(nf(total))}</small></div>
    </div>
  </section>`;
}

/* ------------------------------------------------------------------ */
/* قیمت‌ها                                                             */
/* ------------------------------------------------------------------ */

export function renderPriceCard(asset, series = []) {
  const up = asset.changePct >= 0;
  const spark = sparklineSafe(series, up);
  return `<a class="price-card glass ${dirCls(asset.change)}" href="#/price/${esc(asset.key)}" data-asset="${esc(asset.key)}">
    <div class="pc-head">
      <span class="pc-icon">${esc(asset.icon || '•')}</span>
      <span class="pc-name">${esc(asset.name)}</span>
      <span class="pc-badge ${dirCls(asset.change)}">${esc(pct(asset.changePct))}</span>
    </div>
    <div class="pc-value">${esc(money(asset.last))} <small>${esc(asset.unitLabel)}</small></div>
    <div class="pc-sub">${esc(asset.short)} · ${esc(asset.source || 'ثروتمندی')}</div>
    ${spark}
  </a>`;
}

function sparklineSafe(series, up) {
  if (!series || series.length < 2) {
    return `<div class="spark placeholder"><span>در انتظار اولین نقاط آرشیو…</span></div>`;
  }
  return sparklineImpl(series, { up });
}

export function renderPriceDetail(asset, series, { rangeId = '30d', comments = [], user = null, commentCount = 0 } = {}) {
  const range = rangeById(rangeId);
  const from = range.ms === Infinity ? undefined : Date.now() - range.ms;
  const scoped = from ? series.filter((p) => p.t >= from) : series;
  const st = rangeStats(scoped.length ? scoped : series);

  return `<section class="price-detail">
    <header class="pd-head glass">
      <span class="pd-icon">${esc(asset.icon || '•')}</span>
      <div class="pd-id">
        <h1>${esc(asset.name)}</h1>
        <div class="pd-sub">
          <span class="pill">${esc(asset.short)}</span>
          <span class="pill">منبع: ${esc(asset.source || 'ثروتمندی')}</span>
          ${asset.time ? `<span class="pill mono" dir="ltr">آخرین بروزرسانی: ${esc(formatJalali(asset.time, { seconds: true }))}</span>` : ''}
        </div>
      </div>
      <div class="pd-price">
        <b>${esc(money(asset.last))}</b>
        <small>${esc(asset.unitLabel)}</small>
        <span class="pc-badge ${dirCls(asset.change)}">${esc(pct(asset.changePct))}</span>
      </div>
    </header>

    <div class="pd-ranges">${RANGES.map((r) => `<button class="chip ${rangeId === r.id ? 'active' : ''}" data-range="${r.id}">${r.label}</button>`).join('')}</div>

    <div class="glass pad">
      ${priceChart(scoped.length ? scoped : series, { up: asset.changePct >= 0, label: asset.name, unitLabel: asset.unitLabel })}
      <p class="chart-hint">روی هر نقطه نگه دارید یا بزنید تا قیمت دقیق همان لحظه نمایش داده شود.</p>
    </div>

    ${statsGrid(st, { unitLabel: asset.unitLabel })}

    <div class="glass pad">
      <h3 class="sec-title">📜 تاریخچهٔ ثبت‌شده (قیمت در هر زمان)</h3>
      ${priceTimeline(series, { limit: 14, unitLabel: asset.unitLabel })}
    </div>

    <div class="glass pad" id="comments">
      <h3 class="sec-title">💬 کامنت‌ها ${commentCount ? `<small>(${esc(nf(commentCount))})</small>` : ''}</h3>
      ${renderCommentBox(user, { targetId: `price:${asset.key}`, placeholder: 'نظرت دربارهٔ روند این قیمت چیست؟' })}
      <div data-comments-for="price:${esc(asset.key)}">${renderCommentList(comments, user)}</div>
    </div>

    <div class="pd-links">
      <a class="btn btn-ghost" href="${esc(asset.sourceUrl || '#')}" target="_blank" rel="noopener">مشاهده در ثروتمندی ↗</a>
    </div>
  </section>`;
}

/* ------------------------------------------------------------------ */
/* کامنت‌ها                                                            */
/* ------------------------------------------------------------------ */

export function renderCommentBox(user, { targetId, placeholder = 'کامنت بگذارید…' } = {}) {
  if (!user) {
    return `<div class="auth-gate">
      <div class="ag-lock">🔒</div>
      <p>برای گذاشتن کامنت باید <b>حساب کاربری</b> داشته باشید و وارد شده باشید.</p>
      <div class="ag-actions">
        <button class="btn btn-primary" data-auth="login">ورود به حساب</button>
        <button class="btn btn-ghost" data-auth="register">ساخت حساب کاربری</button>
      </div>
    </div>`;
  }
  return `<form class="comment-form" data-target="${esc(targetId)}">
    <span class="cf-avatar" style="background:hsl(${user.avatarHue || 220} 70% 55%)">${esc((user.displayName || user.username).charAt(0))}</span>
    <input type="text" name="text" maxlength="1500" placeholder="${esc(placeholder)}" autocomplete="off" required>
    <button class="btn btn-primary sm" type="submit">ارسال</button>
  </form>`;
}

export function renderCommentList(comments, user) {
  if (!comments.length) return `<div class="muted center small pad">اولین کامنت را شما بنویسید.</div>`;
  return `<ul class="comment-list">${comments.map((c) => `
    <li class="comment" data-comment="${esc(c.id)}">
      <span class="cf-avatar" style="background:${gradientFor(c.username || c.author)}">${esc((c.author || '؟').charAt(0))}</span>
      <div class="c-body">
        <div class="c-head"><b>${esc(c.author)}</b> <small>@${esc(c.username)}</small> <small>${esc(timeAgo(c.createdAt))}</small></div>
        <p>${esc(c.text)}</p>
        ${user && c.userId === user.id ? `<button class="link danger" data-del-comment="${esc(c.id)}">حذف</button>` : ''}
      </div>
    </li>`).join('')}</ul>`;
}

/* ------------------------------------------------------------------ */
/* جست‌وجو                                                             */
/* ------------------------------------------------------------------ */

export function renderSearchHome({ recent = [], trending = [] }) {
  return `<div class="search-home">
    ${recent.length ? `<div class="recent-row">
      <b>جست‌وجوهای اخیر</b>
      <div class="chips">${recent.map((r) => `<a class="chip" href="#/search?q=${encodeURIComponent(r)}">${esc(r)}</a>`).join('')}
      <button class="chip ghost" data-clear-recent>پاک کردن</button></div>
    </div>` : ''}
    <div class="sec-title">🔥 پرجست‌وجوترین موضوعات</div>
    <div class="chips">${(trending.length ? trending : Object.keys(TOPIC_STYLE)).map((t) => `<a class="chip" href="#/search?q=${encodeURIComponent(t)}">#${esc(t)}</a>`).join('')}</div>
  </div>`;
}

export function renderSearchResults(res) {
  if (!res.total) return `<div class="muted center glass pad">نتیجه‌ای پیدا نشد.</div>`;
  const section = (title, html) => (html ? `<div class="res-block"><h3 class="sec-title">${title}</h3>${html}</div>` : '');

  return `<div class="search-results">
    ${section('📰 خبرگزاری‌ها', res.accounts.length ? `<div class="acc-list">${res.accounts.map((a) => `
      <a class="acc glass" href="#/u/${esc(a.handle)}">
        ${avatar(a, { size: 48 })}
        <span class="acc-id"><b>${esc(a.name)}${verifiedBadge(a.verified)}</b><small>@${esc(a.handle)} · ${esc(a.cat)}</small></span>
        <span class="chev">‹</span>
      </a>`).join('')}</div>` : '')}

    ${section('💹 قیمت‌ها', res.assets.length ? `<div class="mini-assets">${res.assets.map((a) => `
      <a class="glass mini-asset" href="#/price/${esc(a.key)}">
        <span>${esc(a.icon || '•')}</span>
        <b>${esc(a.name)}</b>
        <small>${esc(money(a.last))} ${esc(a.unitLabel || '')}</small>
      </a>`).join('')}</div>` : '')}

    ${section('#️⃣ موضوعات', res.tags.length ? `<div class="chips">${res.tags.map((t) => `
      <a class="chip" href="#/search?q=${encodeURIComponent(t.name)}">#${esc(t.name)} <small>${esc(nf(t.count))}</small></a>`).join('')}</div>` : '')}

    ${section('🗞️ پست‌ها', res.posts.length ? `<div class="res-posts">${res.posts.slice(0, 12).map((p) => `
      <a class="res-post glass" href="#/p/${esc(p.id)}">
        <span class="thumb" style="${p.img ? `background-image:url('${esc(p.img)}')` : `background:${gradientFor(p.title)}`}"></span>
        <span class="rp-body"><b>${esc(p.title)}</b><small>${esc(p.sourceName)} · ${esc(p.exactDateShort)}</small></span>
      </a>`).join('')}</div>` : '')}
  </div>`;
}

/* ------------------------------------------------------------------ */
/* احراز هویت و تنظیمات                                                 */
/* ------------------------------------------------------------------ */

export function renderAuthModal(mode = 'login', error = '') {
  const isLogin = mode === 'login';
  return `<div class="auth-modal">
    <div class="am-logo"><img src="assets/img/logo.svg" alt="رصد" height="42"></div>
    <h2>${isLogin ? 'ورود به حساب کاربری' : 'ساخت حساب کاربری'}</h2>
    <p class="muted small">${isLogin ? 'برای کامنت، پسندیدن و دنبال کردن خبرگزاری‌ها وارد شوید.' : 'حساب شما روی همین دستگاه و (در صورت فعال‌سازی) روی مخزن گیت‌هاب ذخیره می‌شود.'}</p>
    ${error ? `<div class="alert danger">${esc(error)}</div>` : ''}
    <form data-auth-form="${mode}">
      ${!isLogin ? `<label>نام نمایشی<input name="displayName" maxlength="40" placeholder="مثلاً سارا"></label>` : ''}
      <label>نام کاربری<input name="username" required minlength="3" maxlength="24" pattern="[A-Za-z0-9_.]{3,24}" placeholder="username" dir="ltr"></label>
      ${!isLogin ? `<label>ایمیل (اختیاری)<input name="email" type="email" dir="ltr" placeholder="you@example.com"></label>` : ''}
      <label>رمز عبور<input name="password" type="password" required minlength="6" placeholder="حداقل ۶ نویسه" dir="ltr"></label>
      <button class="btn btn-primary block" type="submit">${isLogin ? 'ورود' : 'ثبت‌نام'}</button>
    </form>
    <p class="am-switch">${isLogin ? 'حساب ندارید؟' : 'قبلاً ثبت‌نام کرده‌اید؟'}
      <button class="link" data-switch-auth="${isLogin ? 'register' : 'login'}">${isLogin ? 'ثبت‌نام کنید' : 'وارد شوید'}</button>
    </p>
  </div>`;
}

export function renderSettings({ settings = {}, stats = {}, github = {}, user = null }) {
  const toggle = (key, label, hint = '') => `<label class="row switch">
    <span><b>${label}</b>${hint ? `<small>${hint}</small>` : ''}</span>
    <input type="checkbox" data-setting="${key}" ${settings[key] ? 'checked' : ''}>
  </label>`;

  return `<div class="settings">
    <h3 class="sec-title">👤 حساب کاربری</h3>
    <div class="glass pad">
      ${user ? `<div class="me">
          ${avatar(user, { size: 48 })}
          <div><b>${esc(user.displayName || user.username)}</b><small>@${esc(user.username)}</small></div>
          <button class="btn btn-ghost sm" data-logout>خروج</button>
        </div>`
        : `<p class="muted">وارد نشده‌اید. <button class="link" data-auth="login">ورود / ثبت‌نام</button></p>`}
    </div>

    <h3 class="sec-title">🗄️ ذخیره‌سازی و پایگاه داده</h3>
    <div class="glass pad">
      <div class="stat-line">
        <span>کاربران</span><b>${esc(nf(stats.users || 0))}</b>
      </div>
      <div class="stat-line"><span>پست‌های آرشیوشده</span><b>${esc(nf(stats.posts || 0))}</b></div>
      <div class="stat-line"><span>نقاط قیمتی</span><b>${esc(nf(stats.pricePoints || 0))}</b></div>
      <div class="stat-line"><span>کامنت‌ها</span><b>${esc(nf(stats.comments || 0))}</b></div>
      <div class="stat-line"><span>لایهٔ فعال</span><b>${esc(stats.backend || '—')}</b></div>
      <div class="stat-line"><span>نگهداری اخبار</span><b>${esc(nf(settings.newsDays ?? APP.RETENTION.newsDays))} روز</b></div>
      <div class="stat-line"><span>نگهداری قیمت‌ها</span><b>${esc(nf(settings.priceDays ?? APP.RETENTION.priceDays))} روز</b></div>
      <div class="row-btns">
        <button class="btn btn-ghost sm" data-export>⬇️ خروجی JSON</button>
        <button class="btn btn-ghost sm" data-import>⬆️ ورود JSON</button>
        <button class="btn btn-ghost sm danger" data-reset>پاک‌سازی دادهٔ محلی</button>
      </div>
    </div>

    <h3 class="sec-title">☁️ همگام‌سازی با گیت‌هاب</h3>
    <div class="glass pad">
      <p class="muted small">GitHub Pages دیتابیس ندارد؛ با یک توکن دسترسی محدود (fine-grained PAT با دسترسی Contents) می‌توانید حساب‌ها، دنبال‌شونده‌ها و کامنت‌ها را مستقیم روی مخزن ذخیره کنید تا با پاک شدن مرورگر از بین نروند.</p>
      <label>توکن (PAT)<input name="ghToken" type="password" dir="ltr" value="${esc(github.token || '')}" placeholder="github_pat_..."></label>
      <div class="two-col">
        <label>مالک<input name="ghOwner" dir="ltr" value="${esc(github.owner || '')}" placeholder="rahimf79"></label>
        <label>مخزن<input name="ghRepo" dir="ltr" value="${esc(github.repo || '')}" placeholder="Rasad"></label>
      </div>
      <div class="two-col">
        <label>شاخه<input name="ghBranch" dir="ltr" value="${esc(github.branch || 'main')}"></label>
        <label>پوشه<input name="ghDir" dir="ltr" value="${esc(github.dir || 'user-data')}"></label>
      </div>
      <div class="row-btns">
        <button class="btn btn-primary sm" data-gh-save>ذخیره و فعال‌سازی</button>
        <button class="btn btn-ghost sm" data-gh-test>آزمون اتصال</button>
        <button class="btn btn-ghost sm" data-gh-pull>⬇️ دریافت از گیت‌هاب</button>
      </div>
      <div class="gh-status" data-gh-status>${esc(github.status || '')}</div>
    </div>

    <h3 class="sec-title">🎨 نمایش</h3>
    <div class="glass pad">
      ${toggle('lightMode', 'حالت روشن', 'پوستهٔ شیشه‌ای روشن')}
      ${toggle('reduceMotion', 'کاهش انیمیشن', 'برای دستگاه‌های ضعیف‌تر')}
      ${toggle('autoRefresh', 'بروزرسانی خودکار', 'هر ۵ دقیقه در مرورگر')}
      ${toggle('onlyFollowing', 'فید فقط از دنبال‌شده‌ها', 'مثل صفحهٔ اصلی اینستاگرام')}
      <label class="row">تعداد پست در فید
        <input type="number" min="10" max="120" value="${esc(settings.feedSize || 30)}" data-setting-num="feedSize">
      </label>
    </div>

    <h3 class="sec-title">📡 منابع خبری</h3>
    <div class="glass pad">
      <div class="chips">${(settings.agencyIds || []).map((id) => `<span class="chip active">${esc(id)}</span>`).join('')}</div>
      <label>افزودن فید RSS دلخواه (هر خط یک آدرس — به‌عنوان یک صفحهٔ خبرگزاری جدید ثبت می‌شود)
        <textarea rows="3" data-setting="customFeeds" dir="ltr" placeholder="https://example.com/rss">${esc((settings.customFeeds || []).join('\n'))}</textarea>
      </label>
      <button class="btn btn-primary sm" data-save-settings>ذخیرهٔ تنظیمات</button>
    </div>
  </div>`;
}

/** کارت وضعیت جمع‌آوری برای فوتر صفحات */
export function renderSyncStatus(state) {
  const map = { idle: 'آماده', running: 'در حال جمع‌آوری…', done: 'بروزرسانی شد', error: 'خطا در دریافت', offline: 'آفلاین' };
  return `<div class="sync-pill ${esc(state.status)}" title="${esc(state.detail || '')}">
    <span class="dot"></span>${esc(map[state.status] || state.status)}
    ${state.at ? `<small>${esc(formatJalali(state.at))}</small>` : ''}
  </div>`;
}
