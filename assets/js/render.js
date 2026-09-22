/**
 * قالب‌های رندر — همه توابع رشتهٔ HTML برمی‌گردانند و به DOM دست نمی‌زنند.
 * چیدمان و اجزا دقیقاً از رابط اینستاگرام گرفته شده‌اند: هدر با لوگوتایپ و آیکون‌های
 * اعلان/پیام، ناوبری پنج‌تایی، کارت پست (هدر → رسانه → ردیف اکشن → لایک‌ها → کپشن → نظرها → زمان)،
 * حلقهٔ استوری، پروفایل با آمار سه‌تایی و تب‌های آیکونی، دکمهٔ آبی «دنبال کردن».
 */

import { esc, nf, money, pct, dirCls, timeAgo, timeShort, toFaDigits, gradientFor, compactNum } from './lib/util.js';
import { formatJalali, formatJalaliLong } from './lib/jalali.js';
import { TOPIC_STYLE, APP, PRICE_GROUPS } from './config.js';
import { storyTimeLeft, formatRemaining } from './posts.js';
import { priceChart, statsGrid, priceTimeline, rangeStats, RANGES, rangeById, sparkline as sparklineImpl } from './prices.js';
import { icon, verifiedIcon } from './icons.js';

/* ------------------------------------------------------------------ */
/* اجزای پایه                                                          */
/* ------------------------------------------------------------------ */

export function avatar(entity, { size = 32, hasStory = false, unseen = false, seen = false } = {}) {
  const label = String(entity?.name || entity?.displayName || entity?.username || '؟').trim();
  const initial = label.charAt(0) || '؟';
  const bg = entity?.color || gradientFor(label);
  const ring = hasStory ? `<span class="story-ring ${seen && !unseen ? 'seen' : ''}"></span>` : '';
  const face = entity?.avatarUrl
    ? `<span class="avatar-face" style="background-image:url('${esc(entity.avatarUrl)}')"></span>`
    : `<span class="avatar-face" style="background:${bg.startsWith('linear') ? bg : `linear-gradient(135deg,${bg},${bg}cc)`}">${esc(initial)}</span>`;
  return `<span class="avatar ${hasStory ? 'ringed' : ''}" style="--size:${size}px">${ring}${face}</span>`;
}

export function verifiedBadge(on, size = 12) {
  return on ? verifiedIcon(size) : '';
}

/**
 * دکمهٔ دنبال کردن.
 *  - variant=button: دکمهٔ آبی/خاکستری اینستاگرام (پروفایل)
 *  - variant=text:   لینک آبی کنار نام کاربری (هدر پست/ریلز)
 */
export function followButton(following, agencyId, { variant = 'button' } = {}) {
  if (variant === 'text') {
    return `<button class="txt-btn btn-follow ${following ? 'muted' : ''}" data-agency="${esc(agencyId)}" data-variant="text">${following ? 'دنبال می‌کنید' : 'دنبال کردن'}</button>`;
  }
  return `<button class="btn ${following ? 'btn-secondary' : 'btn-primary'} btn-follow" data-agency="${esc(agencyId)}" data-variant="button">${following ? 'دنبال می‌کنید' : 'دنبال کردن'}</button>`;
}

export function renderEmpty({ ico = 'camera', title = 'چیزی اینجا نیست', text = '', action = '' } = {}) {
  return `<div class="empty">
    <span class="empty-ico">${icon(ico)}</span>
    <h2>${esc(title)}</h2>
    ${text ? `<p>${text}</p>` : ''}
    ${action}
  </div>`;
}

/* ------------------------------------------------------------------ */
/* پوسته: نوار بالا و ناوبری                                            */
/* ------------------------------------------------------------------ */

export const NAV_ITEMS = [
  { route: 'home', label: 'خانه', ico: 'home' },
  { route: 'search', label: 'جست‌وجو', ico: 'search' },
  { route: 'prices', label: 'بازار', ico: 'market' },
  { route: 'reels', label: 'ریلز', ico: 'reels' },
  { route: 'activity', label: 'اعلان‌ها', ico: 'heart', desktop: true },
  { route: 'inbox', label: 'گفتگوها', ico: 'share', desktop: true },
  { route: 'archive', label: 'آرشیو', ico: 'archive', desktop: true },
  { route: 'me', label: 'پروفایل', ico: 'user' }
];

/** ناوبری اصلی: ۵ آیکون در موبایل (پایین)، فهرست کامل با برچسب در دسکتاپ (کنار) */
export function renderNav(active = 'home', { user = null, unread = 0 } = {}) {
  const items = NAV_ITEMS.map((it) => {
    const isActive = active === it.route || (it.route === 'home' && active === 'post');
    const glyph = it.route === 'me' && user
      ? `<span class="nav-ava">${avatar(user, { size: 24 })}</span>`
      : icon(it.ico, { active: isActive });
    const badge = it.route === 'activity' && unread ? `<span class="dot-badge"></span>` : '';
    return `<a class="nav-item ${isActive ? 'active' : ''}" href="#/${it.route === 'home' ? '' : it.route}" data-route="${it.route}" aria-label="${esc(it.label)}" ${it.desktop ? 'data-desktop' : ''}>
      ${glyph}${badge}<span class="lbl">${esc(it.label)}</span></a>`;
  }).join('');

  return `<a class="nav-brand" href="#/" aria-label="رصد">
      <span class="wordmark">Rasad</span>
      <svg class="tile" viewBox="0 0 128 128" aria-hidden="true"><rect x="4" y="4" width="120" height="120" rx="34" fill="url(#tilegrad)"/><g fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><circle cx="64" cy="64" r="34" stroke-opacity=".55" stroke-width="6"/><path d="M64 64 L88 46"/><path d="M32 78 L46 78 L54 58 L66 90 L74 70 L96 70"/></g><circle cx="88" cy="46" r="8" fill="#fff"/><defs><linearGradient id="tilegrad" x1="14%" y1="100%" x2="86%" y2="0%"><stop offset="0%" stop-color="#FEDA75"/><stop offset="22%" stop-color="#FA7E1E"/><stop offset="50%" stop-color="#D62976"/><stop offset="76%" stop-color="#962FBF"/><stop offset="100%" stop-color="#4F5BD5"/></linearGradient></defs></svg>
    </a>
    ${items}
    <span class="nav-spacer"></span>
    <button class="nav-item" data-open-menu aria-label="بیشتر" data-desktop>${icon('menu')}<span class="lbl">بیشتر</span></button>`;
}

/**
 * نوار بالای موبایل بر اساس مسیر:
 *  خانه → لوگوتایپ + فلش (فید دنبال‌شده‌ها) | ♡ اعلان‌ها | ✈ گفتگوها
 *  بقیه → فلش برگشت + عنوان (+ اکشن‌های اختصاصی)
 */
export function renderTopbar(route, { title = '', onlyFollowing = false, unread = 0, user = null, handle = '', q = '' } = {}) {
  const back = `<button class="ibtn" data-back aria-label="بازگشت">${icon('back')}</button>`;
  switch (route) {
    case 'home':
      return `<button class="brand" data-brand-menu aria-label="رصد - فید" aria-haspopup="menu">
          <span class="wordmark">Rasad</span><span class="chev">${icon('chevronDown')}</span>
        </button>
        <span class="grow"></span>
        <div class="topbar-end">
          <a class="ibtn" href="#/activity" aria-label="اعلان‌ها" style="position:relative">${icon('heart')}${unread ? '<span class="dot-badge"></span>' : ''}</a>
          <a class="ibtn" href="#/inbox" aria-label="گفتگوها">${icon('share')}</a>
        </div>`;
    case 'search':
      return `<div class="searchbox" role="search">
          ${icon('search')}
          <input id="searchInput" type="search" placeholder="جست‌وجو" value="${esc(q)}" autocomplete="off" enterkeyhint="search">
          ${q ? `<button class="clear" data-clear-search aria-label="پاک کردن">${icon('close')}</button>` : ''}
        </div>`;
    case 'me':
      return `<span class="title">${user ? `<span class="handle">${esc(user.username)}</span>` : 'پروفایل'}</span>
        <div class="topbar-end">
          <button class="ibtn" data-open-menu aria-label="منو">${icon('menu')}</button>
        </div>`;
    case 'agency':
      return `${back}<span class="title"><span class="handle">${esc(handle)}</span>${verifiedBadge(true, 14)}</span>
        <div class="topbar-end"><button class="ibtn" data-agency-menu="${esc(handle)}" aria-label="بیشتر">${icon('moreV')}</button></div>`;
    case 'reels':
      return `<span class="title">ریلز</span><div class="topbar-end"><a class="ibtn" href="#/search" aria-label="جست‌وجو">${icon('search')}</a></div>`;
    default:
      return `${back}<span class="title">${esc(title)}</span>
        ${route === 'prices' ? `<div class="topbar-end"><button class="ibtn" data-refresh-bundle aria-label="بروزرسانی">${icon('refresh')}</button></div>` : ''}`;
  }
}

/** منوی کشویی زیر لوگوتایپ (مثل Following/Favorites اینستاگرام) */
export function renderBrandMenu({ onlyFollowing = false, bundle = null } = {}) {
  const meta = bundle?.generatedAt
    ? `آخرین بروزرسانی خودکار: ${esc(timeAgo(bundle.generatedAt))} · هر ${esc(toFaDigits(bundle.intervalMinutes || APP.COLLECT_INTERVAL_MIN))} دقیقه`
    : 'هنوز اولین جمع‌آوری خودکار منتشر نشده است';
  return `<div class="brand-drop" role="menu">
    <button role="menuitem" class="${onlyFollowing ? '' : 'on'}" data-feed-mode="all">${icon('home')}<span>همه</span><span class="tick">${icon('check', { size: 18 })}</span></button>
    <button role="menuitem" class="${onlyFollowing ? 'on' : ''}" data-feed-mode="following">${icon('user')}<span>دنبال‌شده‌ها</span><span class="tick">${icon('check', { size: 18 })}</span></button>
    <div class="drop-meta">${meta}</div>
  </div>`;
}

/** شیت پایین‌صفحه (منوی «بیشتر»، منوی پست) */
export function renderSheet(items = [], { title = '' } = {}) {
  return `<div class="sheet" role="menu">
    <div class="sheet-grab"></div>
    ${title ? `<div class="sheet-title">${esc(title)}</div>` : ''}
    ${items.map((it) => {
      if (it === 'sep') return '<div class="sheet-sep"></div>';
      const inner = `${it.ico ? icon(it.ico) : ''}<span>${esc(it.label)}</span>`;
      if (it.href) return `<a role="menuitem" class="${it.danger ? 'danger' : ''}" href="${esc(it.href)}" ${it.external ? 'target="_blank" rel="noopener"' : ''} data-close-sheet>${inner}</a>`;
      return `<button role="menuitem" class="${it.danger ? 'danger' : ''}" data-sheet-action="${esc(it.action || '')}" ${it.data ? Object.entries(it.data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ') : ''}>${inner}</button>`;
    }).join('')}
  </div>`;
}

/* ------------------------------------------------------------------ */
/* استوری                                                              */
/* ------------------------------------------------------------------ */

export function renderStoryRail(stories) {
  if (!stories.length) return `<div class="story-rail empty" aria-hidden="true"></div>`;
  return `<div class="story-rail">${stories.map((s, i) => `
    <button class="story-item ${s.unseen ? 'live' : ''}" data-story-index="${i}" title="${esc(s.agency.full)}">
      ${avatar(s.agency, { size: 66, hasStory: true, unseen: s.unseen, seen: !s.unseen })}
      <span class="story-name ${s.unseen ? '' : 'seen'}">${esc(s.agency.name)}</span>
    </button>`).join('')}</div>`;
}

export function renderStoryViewer(stories, index, itemIndex) {
  const s = stories[index];
  if (!s) return '';
  const item = s.items[itemIndex] || s.items[0];
  const left = storyTimeLeft(item);
  const segments = s.items.map((it, i) => `<i class="seg ${i < itemIndex ? 'done' : ''} ${i === itemIndex ? 'active' : ''}"></i>`).join('');

  return `<div class="story-viewer">
    <div class="story-progress">${segments}</div>
    <div class="story-top">
      <a class="story-user" href="#/u/${esc(s.agency.handle)}">
        ${avatar(s.agency, { size: 32 })}
        <span><b>${esc(s.agency.name)}</b><small>${esc(timeShort(item.date))}</small></span>
      </a>
      <button class="ibtn light" data-close-story aria-label="بستن">${icon('close')}</button>
    </div>
    <div class="story-media" style="${item.img ? `background-image:url('${esc(item.img)}')` : `background:${gradientFor(item.title)}`}">
      ${item.img ? '' : `<div class="story-fallback"><h2>${esc(item.title)}</h2></div>`}
      <div class="story-shade"></div>
    </div>
    <div class="story-caption">
      ${item.img ? `<h2>${esc(item.title)}</h2>` : ''}
      <p>${esc((item.desc || '').slice(0, 220))}</p>
      <div class="tiny" style="opacity:.75;margin-top:6px">${esc(item.topic)} · ${esc(formatRemaining(left))} تا پایان استوری</div>
    </div>
    <a class="story-link" href="${esc(item.link)}" target="_blank" rel="noopener">${icon('link', { size: 16 })} مشاهدهٔ خبر</a>
    <div class="story-nav">
      <button class="story-tap" data-story-prev aria-label="قبلی"></button>
      <button class="story-tap" data-story-next aria-label="بعدی"></button>
    </div>
    <div class="story-bottom">
      <a class="reply" href="#/p/${esc(item.id)}">دیدن پست و نظرها…</a>
      <button class="ibtn light" data-like="${esc(item.id)}" aria-label="پسندیدن">${icon('heart')}</button>
      <button class="ibtn light" data-share="${esc(item.link)}" aria-label="ارسال">${icon('share')}</button>
    </div>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* پست                                                                 */
/* ------------------------------------------------------------------ */

function mediaBlock(post, { href = `#/p/${esc(post.id)}`, tag = true } = {}) {
  const topicClass = TOPIC_STYLE[post.topic] || '';
  if (post.img) {
    return `<a class="post-media" href="${href}" data-media="${esc(post.id)}" style="background-image:url('${esc(post.img)}')" aria-label="${esc(post.title)}">
      ${tag ? `<span class="topic-tag ${topicClass}">${esc(post.topic)}</span>` : ''}
      <span class="heart-burst">${icon('heartFill', { size: 96 })}</span>
    </a>`;
  }
  return `<a class="post-media tile" href="${href}" data-media="${esc(post.id)}" style="background:${gradientFor(post.title)}">
    ${tag ? `<span class="topic-tag ${topicClass}">${esc(post.topic)}</span>` : ''}
    <h3>${esc(post.title)}</h3>
    <span class="heart-burst">${icon('heartFill', { size: 96 })}</span>
  </a>`;
}

function actionsRow(post, { liked, saved }) {
  return `<div class="post-actions">
    <div class="acts">
      <button class="act ${liked ? 'on' : ''}" data-like="${esc(post.id)}" aria-label="پسندیدن">${icon('heart', { active: liked })}</button>
      <a class="act" href="#/p/${esc(post.id)}#comments" aria-label="نظر">${icon('comment')}</a>
      <button class="act" data-share="${esc(post.link)}" aria-label="ارسال">${icon('share')}</button>
    </div>
    <div class="acts end">
      <button class="act save ${saved ? 'on' : ''}" data-save="${esc(post.id)}" aria-label="ذخیره">${icon('bookmark', { active: saved })}</button>
    </div>
  </div>`;
}

function addCommentRow(post, user) {
  if (!user) {
    return `<div class="add-comment guest" data-auth="login" role="button">
      <span class="avatar" style="--size:24px"><span class="avatar-face" style="background:var(--bg-3);color:var(--text-2)">${icon('user', { size: 14 })}</span></span>
      <span>افزودن نظر…</span>
    </div>`;
  }
  return `<form class="comment-form add-comment" data-target="${esc(post.id)}" style="border-top:none;margin-top:6px;padding:4px 0">
    ${avatar(user, { size: 24 })}
    <input type="text" name="text" maxlength="1500" placeholder="افزودن نظر…" autocomplete="off" required>
    <button class="send" type="submit">ارسال</button>
  </form>`;
}

export function renderPost(post, ctx = {}) {
  const { liked = false, saved = false, likeCount = 0, commentCount = 0, following = false, comments = [], user = null, hasStory = false, seenStory = false } = ctx;
  const agency = { name: post.sourceName, color: post.sourceColor, handle: post.sourceHandle };
  const preview = comments.slice(-2);
  const capText = post.desc && post.desc !== post.title ? `${esc(post.title)} — ${esc(post.desc.slice(0, 300))}` : esc(post.title);

  return `<article class="post" data-post="${esc(post.id)}">
    <header class="post-head">
      <a class="post-user" href="#/u/${esc(post.sourceHandle)}">
        ${avatar(agency, { size: 32, hasStory, seen: seenStory })}
        <span class="who">
          <span class="row"><b>${esc(post.sourceName)}${verifiedBadge(true)}</b><span class="dot">•</span><time datetime="${new Date(post.date).toISOString()}">${esc(timeShort(post.date))}</time>
            ${following ? '' : `<span class="dot">•</span>${followButton(false, post.sourceId, { variant: 'text' })}`}</span>
          <small>${esc(post.topic)}</small>
        </span>
      </a>
      <button class="ibtn" data-post-menu="${esc(post.id)}" aria-label="بیشتر">${icon('more')}</button>
    </header>

    ${mediaBlock(post)}
    ${actionsRow(post, { liked, saved })}

    <div class="post-body">
      <div class="likes">${esc(nf(likeCount))} پسند</div>
      <div class="caption clamped" data-caption>
        <a class="uname" href="#/u/${esc(post.sourceHandle)}">${esc(post.sourceName)}</a><span class="cap-text">${capText}
          <span class="tags">${(post.hashtags || []).map((t) => `<a href="#/search?q=${encodeURIComponent(t)}">#${esc(t)}</a>`).join('')}</span></span>
        <button class="more" data-more>بیشتر</button>
      </div>
      ${commentCount ? `<a class="view-comments" href="#/p/${esc(post.id)}#comments">مشاهدهٔ همهٔ ${esc(nf(commentCount))} نظر</a>` : ''}
      ${preview.map((c) => `<div class="cmt-preview"><b>${esc(c.author)}</b>${esc(c.text.slice(0, 120))}</div>`).join('')}
      <time class="post-time">${esc(timeAgo(post.date))} · <span class="mono" dir="ltr">${esc(post.exactDate)}</span></time>
      ${addCommentRow(post, user)}
    </div>
  </article>`;
}

export function renderPostDetail(post, ctx = {}) {
  const { liked = false, saved = false, likeCount = 0, commentCount = 0, following = false, user = null, comments = [] } = ctx;
  const agency = { name: post.sourceName, color: post.sourceColor };
  return `<section class="detail">
    <article class="post" data-post="${esc(post.id)}">
      <header class="post-head">
        <a class="post-user" href="#/u/${esc(post.sourceHandle)}">
          ${avatar(agency, { size: 32 })}
          <span class="who">
            <span class="row"><b>${esc(post.sourceName)}${verifiedBadge(true)}</b>${following ? '' : `<span class="dot">•</span>${followButton(false, post.sourceId, { variant: 'text' })}`}</span>
            <small>${esc(post.sourceFull)}</small>
          </span>
        </a>
        <button class="ibtn" data-post-menu="${esc(post.id)}" aria-label="بیشتر">${icon('more')}</button>
      </header>
      ${mediaBlock(post, { href: esc(post.link) })}
      ${actionsRow(post, { liked, saved })}
      <div class="post-body">
        <div class="likes">${esc(nf(likeCount))} پسند</div>
        <div class="caption" data-caption>
          <a class="uname" href="#/u/${esc(post.sourceHandle)}">${esc(post.sourceName)}</a>
          <span class="cap-text"><b>${esc(post.title)}</b>${post.desc ? `<br>${esc(post.desc)}` : ''}</span>
        </div>
        ${post.content && post.content !== post.desc ? `<p class="caption" style="color:var(--text-2)">${esc(post.content).replace(/\n/g, '<br>')}</p>` : ''}
        <div class="caption tags">${(post.hashtags || []).map((t) => `<a href="#/search?q=${encodeURIComponent(t)}">#${esc(t)}</a>`).join('')}</div>
        <time class="post-time">${esc(formatJalaliLong(post.date))} · <span class="mono" dir="ltr">${esc(post.exactDate)}</span> · آرشیو ${esc(formatJalali(post.collectedAt || post.date, { withTime: false }))}</time>
        <div style="display:flex;gap:8px;margin-top:12px">
          <a class="btn btn-primary" href="${esc(post.link)}" target="_blank" rel="noopener">مشاهده در ${esc(post.sourceName)}</a>
          <a class="btn btn-secondary" href="#/u/${esc(post.sourceHandle)}">صفحهٔ خبرگزاری</a>
        </div>
      </div>
    </article>
    <div class="comments-wrap" id="comments">
      <div class="sec-title" style="margin:0 0 4px">نظرها <small>(${esc(nf(commentCount))})</small></div>
      <div data-comments-for="${esc(post.id)}">${renderCommentList(comments, user)}</div>
      ${renderCommentBox(user, { targetId: post.id, placeholder: 'افزودن نظر…' })}
    </div>
  </section>`;
}

/* ------------------------------------------------------------------ */
/* پروفایل خبرگزاری                                                     */
/* ------------------------------------------------------------------ */

export function renderProfile(agency, { posts = [], following = false, storyCount = 0, tab = 'posts', followers = 0, counts = {}, unseen = false } = {}) {
  const tabs = [
    { id: 'posts', label: 'پست‌ها', ico: 'grid' },
    { id: 'stories', label: 'استوری‌ها', ico: 'clock' },
    { id: 'archive', label: 'آرشیو', ico: 'tag' }
  ];
  const list = tab === 'stories' ? posts.filter((p) => Date.now() - p.date < APP.STORY_TTL_MS) : posts;
  const site = String(agency.site || '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

  return `<section class="profile">
    <div class="profile-top">
      ${avatar(agency, { size: 86, hasStory: storyCount > 0, unseen, seen: !unseen })}
      <div class="profile-stats">
        <div><b>${esc(nf(counts.posts ?? list.length))}</b><span>پست</span></div>
        <div><b>${esc(compactNum(followers))}</b><span>دنبال‌کننده</span></div>
        <div><b>${esc(nf(counts.stories ?? storyCount))}</b><span>استوری</span></div>
      </div>
    </div>
    <div class="profile-bio">
      <h1>${esc(agency.name)}${verifiedBadge(agency.verified, 14)}</h1>
      <div class="cat">${esc(agency.full)} · ${esc(agency.cat)}</div>
      <p>${esc(agency.bio)}</p>
      <a class="bio-link" href="${esc(agency.site)}" target="_blank" rel="noopener">${icon('link', { size: 14 })} ${esc(site)}</a>
    </div>
    <div class="profile-btns">
      ${followButton(following, agency.id)}
      <a class="btn btn-secondary" href="${esc(agency.site)}" target="_blank" rel="noopener">سایت منبع</a>
      <button class="btn btn-secondary sq" data-share="${esc(agency.site)}" aria-label="اشتراک‌گذاری">${icon('share', { size: 18 })}</button>
    </div>

    <nav class="profile-tabs" role="tablist">${tabs.map((t) => `<button role="tab" class="tab ${tab === t.id ? 'active' : ''}" data-ptab="${t.id}" title="${t.label}" aria-label="${t.label}" aria-selected="${tab === t.id}">${icon(t.ico)}<span class="lbl">${t.label}</span></button>`).join('')}</nav>

    ${tab === 'archive'
      ? `<div class="note">آرشیو کامل با تاریخ دقیق انتشار. پست‌ها تاریخ انقضا ندارند و فقط بر اساس سیاست نگهداری (${esc(nf(APP.RETENTION.newsDays))} روز) پاک‌سازی می‌شوند.</div>`
      : ''}

    ${list.length
      ? `<div class="profile-grid">${list.map((p) => gridCell(p, { meta: tab === 'archive' ? p.exactDateShort : '' })).join('')}</div>`
      : renderEmpty({ ico: 'camera', title: 'هنوز پستی نیست', text: 'با اولین جمع‌آوری خودکار، پست‌های این خبرگزاری اینجا نمایش داده می‌شود.' })}
  </section>`;
}

export function gridCell(p, { meta = '' } = {}) {
  return `<a class="grid-cell" href="#/p/${esc(p.id)}" style="${p.img ? `background-image:url('${esc(p.img)}')` : `background:${gradientFor(p.title)}`}" title="${esc(p.title)}">
    ${!p.img ? `<span class="grid-title">${esc(p.title)}</span>` : ''}
    ${meta ? `<span class="grid-meta">${esc(meta)}</span>` : ''}
  </a>`;
}

/* ------------------------------------------------------------------ */
/* اکسپلور و ریلز                                                      */
/* ------------------------------------------------------------------ */

export function renderExplore(posts) {
  if (!posts.length) return renderEmpty({ ico: 'search', title: 'چیزی برای نمایش نیست' });
  return `<div class="explore-grid">${posts.map((p, i) => {
    const big = i % 10 === 2;
    return `<a class="exp-cell ${big ? 'big' : ''}" href="#/p/${esc(p.id)}" style="${p.img ? `background-image:url('${esc(p.img)}')` : `background:${gradientFor(p.title)}`}" title="${esc(p.title)}">
      ${!p.img ? `<span class="exp-title">${esc(p.title)}</span>` : ''}
      ${big ? `<span class="grid-ico">${icon('reels')}</span>` : ''}
    </a>`;
  }).join('')}</div>`;
}

export function renderReel(post, ctx = {}) {
  const { liked = false, likeCount = 0, commentCount = 0, index = 0, total = 0, following = false } = ctx;
  return `<section class="reel" data-reel="${esc(post.id)}">
    <div class="reel-bg" style="${post.img ? `background-image:url('${esc(post.img)}')` : `background:${gradientFor(post.title)}`}"></div>
    <div class="reel-shade"></div>
    <div class="reel-body">
      <a class="reel-user" href="#/u/${esc(post.sourceHandle)}">
        ${avatar({ name: post.sourceName, color: post.sourceColor }, { size: 32 })}
        <b>${esc(post.sourceName)}${verifiedBadge(true)}</b>
        ${following ? '' : `<span class="follow-pill btn-follow" data-agency="${esc(post.sourceId)}" data-variant="pill">دنبال کردن</span>`}
      </a>
      <h2>${esc(post.title)}</h2>
      <p>${esc((post.desc || '').slice(0, 200))}</p>
      <div class="reel-meta">
        <span>${esc(post.topic)}</span><span>·</span><span>${esc(timeAgo(post.date))}</span><span>·</span>
        <a href="${esc(post.link)}" target="_blank" rel="noopener" style="text-decoration:underline">خواندن کامل</a>
      </div>
    </div>
    <div class="reel-rail">
      <button class="rail-btn ${liked ? 'on' : ''}" data-like="${esc(post.id)}" aria-label="پسندیدن">${icon('heart', { active: liked })}<small>${esc(compactNum(likeCount))}</small></button>
      <a class="rail-btn" href="#/p/${esc(post.id)}#comments" aria-label="نظر">${icon('comment')}<small>${esc(nf(commentCount))}</small></a>
      <button class="rail-btn" data-share="${esc(post.link)}" aria-label="ارسال">${icon('share')}</button>
      <button class="rail-btn" data-post-menu="${esc(post.id)}" aria-label="بیشتر">${icon('moreV')}</button>
      <span class="rail-btn" aria-hidden="true"><small>${esc(nf(index + 1))}/${esc(nf(total))}</small></span>
    </div>
  </section>`;
}

/* ------------------------------------------------------------------ */
/* بازار و قیمت‌ها                                                     */
/* ------------------------------------------------------------------ */

export function renderPriceCard(asset, series = []) {
  const up = (asset.changePct ?? 0) >= 0;
  const spark = sparklineSafe(series?.length ? series : asset.spark || [], up);
  return `<a class="mrow ${dirCls(asset.change)}" href="#/price/${esc(asset.key)}" data-asset="${esc(asset.key)}">
    <span class="micon">${esc(asset.icon || '•')}</span>
    <span class="mname"><b>${esc(asset.name)}</b><small>${esc(asset.short)} · ${esc(asset.source || 'ثروتمندی')}${asset.stale ? ' · آرشیو' : ''}</small></span>
    ${spark}
    <span class="mval">
      <b>${esc(money(asset.last))} <span class="unit">${esc(asset.unitLabel || '')}</span></b>
      <small class="${dirCls(asset.change)}">${esc(pct(asset.changePct))}</small>
    </span>
  </a>`;
}

function sparklineSafe(series, up) {
  if (!series || series.length < 2) return `<span class="spark placeholder" aria-hidden="true"></span>`;
  return sparklineImpl(series, { up, w: 72, h: 28 });
}

export function renderMarket({ assets = [], group = 'all', bundle = null, missing = 0, series = new Map() } = {}) {
  const groups = PRICE_GROUPS.map((g) =>
    `<button class="chip ${group === g.id ? 'active' : ''}" data-pgroup="${g.id}">${g.label}</button>`).join('');
  const list = assets.filter((a) => group === 'all' || a.group === group)
    .sort((a, b) => Number(!!b.featured) - Number(!!a.featured) || a.name.localeCompare(b.name, 'fa'));
  const updated = bundle?.generatedAt ? `بروزرسانی خودکار ${esc(timeAgo(bundle.generatedAt))} · هر ${esc(toFaDigits(bundle.intervalMinutes || APP.COLLECT_INTERVAL_MIN))} دقیقه` : 'در انتظار اولین اجرای جمع‌آوری خودکار';

  return `<section class="market">
    <div class="chips">${groups}</div>
    <div class="market-bar"><span>${updated}</span><span>ثروتمندی · باما</span></div>
    ${missing ? `<div class="note">${esc(nf(missing))} دارایی هنوز داده ندارد و با اجرای بعدی جمع‌آوری پر می‌شود.</div>` : ''}
    <div class="rows">${list.map((a) => renderPriceCard(a, series.get(a.key) || [])).join('') ||
      renderEmpty({ ico: 'market', title: 'داده‌ای ثبت نشده', text: 'با اولین اجرای جمع‌آوری خودکار، قیمت‌ها اینجا نمایش داده می‌شود.' })}</div>
  </section>`;
}

export function renderPriceDetail(asset, series, { rangeId = '30d', comments = [], user = null, commentCount = 0 } = {}) {
  const range = rangeById(rangeId);
  const from = range.ms === Infinity ? undefined : Date.now() - range.ms;
  const scoped = from ? series.filter((p) => p.t >= from) : series;
  const st = rangeStats(scoped.length ? scoped : series);
  const cls = dirCls(asset.change);

  return `<section class="price-detail">
    <header class="pd-head">
      <span class="micon">${esc(asset.icon || '•')}</span>
      <div class="pd-id">
        <h1>${esc(asset.name)}</h1>
        <div class="sub"><span>${esc(asset.short)}</span><span>منبع: ${esc(asset.source || 'ثروتمندی')}</span>${asset.time ? `<span class="mono" dir="ltr">${esc(formatJalali(asset.time, { seconds: true }))}</span>` : ''}</div>
      </div>
    </header>
    <div class="pd-price">
      <b>${esc(money(asset.last))}</b><span class="unit">${esc(asset.unitLabel || '')}</span>
      <span class="chg ${cls}">${esc(pct(asset.changePct))} (${esc(money(Math.abs(asset.change || 0)))})</span>
    </div>

    <div class="pd-ranges chips">${RANGES.map((r) => `<button class="chip ${rangeId === r.id ? 'active' : ''}" data-range="${r.id}">${r.label}</button>`).join('')}</div>

    <div class="chart-card">
      ${priceChart(scoped.length ? scoped : series, { up: (asset.changePct ?? 0) >= 0, label: asset.name, unitLabel: asset.unitLabel })}
      <p class="chart-hint">روی هر نقطه بزنید تا قیمت دقیق همان لحظه نمایش داده شود.</p>
    </div>

    ${statsGrid(st, { unitLabel: asset.unitLabel })}

    <div class="sec-title" style="padding:0 16px">تاریخچهٔ ثبت‌شده <small>قیمت در هر زمان</small></div>
    ${priceTimeline(series, { limit: 14, unitLabel: asset.unitLabel })}

    <div class="pd-comments" id="comments">
      <div class="sec-title">نظرها ${commentCount ? `<small>(${esc(nf(commentCount))})</small>` : ''}</div>
      <div data-comments-for="price:${esc(asset.key)}">${renderCommentList(comments, user)}</div>
      ${renderCommentBox(user, { targetId: `price:${asset.key}`, placeholder: 'نظرت دربارهٔ روند این قیمت چیست؟' })}
    </div>

    <div class="pd-links">
      <a class="btn btn-secondary block" href="${esc(asset.sourceUrl || '#')}" target="_blank" rel="noopener">${icon('external', { size: 16 })} مشاهده در ${esc(asset.source || 'ثروتمندی')}</a>
    </div>
  </section>`;
}

/* ------------------------------------------------------------------ */
/* کامنت‌ها                                                            */
/* ------------------------------------------------------------------ */

export function renderCommentBox(user, { targetId, placeholder = 'افزودن نظر…' } = {}) {
  if (!user) {
    return `<div class="auth-gate">
      ${icon('lock', { size: 20 })}
      <span>برای گذاشتن نظر باید <b>حساب کاربری</b> داشته باشید.</span>
      <button class="txt-btn" data-auth="login">ورود</button>
      <button class="txt-btn" data-auth="register">ثبت‌نام</button>
    </div>`;
  }
  return `<form class="comment-form" data-target="${esc(targetId)}">
    ${avatar(user, { size: 32 })}
    <input type="text" name="text" maxlength="1500" placeholder="${esc(placeholder)}" autocomplete="off" required>
    <button class="send" type="submit">ارسال</button>
  </form>`;
}

export function renderCommentList(comments, user) {
  if (!comments.length) return `<div class="muted small" style="padding:10px 0">هنوز نظری ثبت نشده؛ اولین نفر باشید.</div>`;
  return `<ul class="comment-list">${comments.map((c) => `
    <li class="comment" data-comment="${esc(c.id)}">
      ${avatar({ name: c.author, username: c.username, color: `hsl(${(c.avatarHue ?? 200)} 60% 50%)` }, { size: 32 })}
      <div class="c-body">
        <div class="c-text"><b>${esc(c.username || c.author)}</b>${esc(c.text)}</div>
        <div class="c-meta"><span>${esc(timeAgo(c.createdAt))}</span>
          ${user && c.userId === user.id ? `<button class="danger" data-del-comment="${esc(c.id)}">حذف</button>` : ''}</div>
      </div>
    </li>`).join('')}</ul>`;
}

/* ------------------------------------------------------------------ */
/* جست‌وجو                                                             */
/* ------------------------------------------------------------------ */

export function renderSearchHome({ recent = [], trending = [] }) {
  return `<div class="search-home">
    ${recent.length ? `<div class="row-head"><span>اخیر</span><button class="txt-btn" data-clear-recent>پاک کردن همه</button></div>
      <div class="rows">${recent.map((r) => `<a class="row-item" href="#/search?q=${encodeURIComponent(r)}">
        <span class="ico-circle">${icon('search', { size: 18 })}</span><span class="row-main"><b>${esc(r)}</b></span>
        <span class="row-end">${icon('close', { size: 14 })}</span></a>`).join('')}</div>` : ''}
    <div class="row-head"><span>موضوعات داغ</span></div>
    <div class="chips" style="padding:0 16px 8px">${(trending.length ? trending : Object.keys(TOPIC_STYLE)).map((t) => `<a class="chip" href="#/search?q=${encodeURIComponent(t)}">#${esc(t)}</a>`).join('')}</div>
  </div>`;
}

export function renderSearchResults(res) {
  if (!res.total) return renderEmpty({ ico: 'search', title: 'نتیجه‌ای پیدا نشد', text: 'عبارت دیگری را امتحان کنید.' });
  const section = (title, html) => (html ? `<div class="res-block"><div class="row-head">${title}</div>${html}</div>` : '');

  return `<div class="search-results">
    ${section('خبرگزاری‌ها', res.accounts.length ? `<div class="rows">${res.accounts.map((a) => `
      <a class="row-item" href="#/u/${esc(a.handle)}">
        ${avatar(a, { size: 44 })}
        <span class="row-main"><b>${esc(a.name)}${verifiedBadge(a.verified)}</b><small>${esc(a.handle)} · ${esc(a.cat)}</small></span>
      </a>`).join('')}</div>` : '')}

    ${section('قیمت‌ها', res.assets.length ? `<div class="rows">${res.assets.map((a) => `
      <a class="row-item" href="#/price/${esc(a.key)}">
        <span class="ico-circle">${esc(a.icon || '•')}</span>
        <span class="row-main"><b>${esc(a.name)}</b><small>${esc(a.short || '')} · ${esc(a.source || 'ثروتمندی')}</small></span>
        <span class="row-end"><b class="mono" dir="ltr">${esc(money(a.last))}</b> <small class="${dirCls(a.change)}">${esc(pct(a.changePct))}</small></span>
      </a>`).join('')}</div>` : '')}

    ${section('موضوعات', res.tags.length ? `<div class="rows">${res.tags.map((t) => `
      <a class="row-item tag-row" href="#/search?q=${encodeURIComponent(t.name)}">
        <span class="ico-circle">#</span>
        <span class="row-main"><b>#${esc(t.name)}</b><small>${esc(nf(t.count))} پست</small></span>
      </a>`).join('')}</div>` : '')}

    ${section('پست‌ها', res.posts.length ? `<div class="rows">${res.posts.slice(0, 20).map((p) => `
      <a class="row-item" href="#/p/${esc(p.id)}">
        <span class="row-main"><b>${esc(p.title)}</b><small>${esc(p.sourceName)} · ${esc(p.exactDateShort)}</small></span>
        <span class="row-end"><span class="thumb" style="${p.img ? `background-image:url('${esc(p.img)}')` : `background:${gradientFor(p.title)}`}"></span></span>
      </a>`).join('')}</div>` : '')}
  </div>`;
}

/* ------------------------------------------------------------------ */
/* فعالیت (اعلان‌ها) و گفتگوها                                          */
/* ------------------------------------------------------------------ */

/**
 * @param {Array} items [{type:'post'|'price'|'system', ...}]
 */
export function renderActivity(items = []) {
  if (!items.length) return renderEmpty({ ico: 'heart', title: 'فعالیتی نیست', text: 'وقتی خبرگزاری‌های دنبال‌شده پست جدید بگذارند یا قیمتی جهش کند، اینجا می‌بینید.' });
  const groups = [['امروز', []], ['این هفته', []], ['قدیمی‌تر', []]];
  const now = Date.now();
  for (const it of items) {
    const age = now - it.at;
    (age < 864e5 ? groups[0][1] : age < 7 * 864e5 ? groups[1][1] : groups[2][1]).push(it);
  }
  return `<div class="activity">${groups.filter(([, l]) => l.length).map(([title, l]) => `
    <div class="row-head">${title}</div>
    <div class="rows">${l.map((it) => {
      if (it.type === 'price') {
        return `<a class="row-item" href="#/price/${esc(it.asset.key)}">
          <span class="ico-circle">${esc(it.asset.icon || '•')}</span>
          <span class="row-main"><span class="txt"><b>${esc(it.asset.name)}</b> ${it.asset.changePct >= 0 ? 'رشد' : 'افت'} <b class="${dirCls(it.asset.change)}">${esc(pct(it.asset.changePct))}</b> داشت — ${esc(money(it.asset.last))} ${esc(it.asset.unitLabel || '')}</span><small>${esc(timeAgo(it.at))}</small></span>
        </a>`;
      }
      if (it.type === 'post') {
        return `<a class="row-item" href="#/p/${esc(it.post.id)}">
          ${avatar({ name: it.post.sourceName, color: it.post.sourceColor }, { size: 44 })}
          <span class="row-main"><span class="txt"><b>${esc(it.post.sourceName)}</b> پست جدیدی منتشر کرد: ${esc(it.post.title.slice(0, 90))}</span><small>${esc(timeAgo(it.at))}</small></span>
          <span class="row-end"><span class="thumb" style="${it.post.img ? `background-image:url('${esc(it.post.img)}')` : `background:${gradientFor(it.post.title)}`}"></span></span>
        </a>`;
      }
      return `<div class="row-item"><span class="ico-circle">${icon('info', { size: 20 })}</span><span class="row-main"><span class="txt">${esc(it.text)}</span><small>${esc(timeAgo(it.at))}</small></span></div>`;
    }).join('')}</div>`).join('')}</div>`;
}

export function renderInbox(threads = [], user = null) {
  if (!user) {
    return renderEmpty({
      ico: 'share', title: 'گفتگوهای شما',
      text: 'نظرهایی که زیر خبرها و قیمت‌ها می‌گذارید اینجا به‌صورت گفتگو جمع می‌شود. برای دیدن آن‌ها وارد شوید.',
      action: `<button class="btn btn-primary" data-auth="login">ورود</button>`
    });
  }
  if (!threads.length) return renderEmpty({ ico: 'comment', title: 'هنوز گفتگویی ندارید', text: 'زیر هر پست یا قیمت نظر بگذارید تا اینجا نمایش داده شود.' });
  return `<div class="rows">${threads.map((t) => `
    <a class="row-item" href="${esc(t.href)}">
      ${t.img ? `<span class="row-end" style="margin:0"><span class="thumb" style="background-image:url('${esc(t.img)}')"></span></span>` : `<span class="ico-circle">${esc(t.icon || '💬')}</span>`}
      <span class="row-main"><b>${esc(t.title)}</b><small>${esc(t.last)} · ${esc(timeAgo(t.at))}</small></span>
      <span class="row-end">${t.count > 1 ? `<span class="pill">${esc(nf(t.count))}</span>` : ''}${icon('chevronStart', { size: 14 })}</span>
    </a>`).join('')}</div>`;
}

/* ------------------------------------------------------------------ */
/* آرشیو                                                               */
/* ------------------------------------------------------------------ */

export function renderArchiveDays(days = [], { retentionDays = APP.RETENTION.newsDays } = {}) {
  if (!days.length) return renderEmpty({ ico: 'archive', title: 'آرشیو خالی است', text: 'با هر اجرای جمع‌آوری خودکار، خبرها با تاریخ دقیق انتشار اینجا بایگانی می‌شوند.' });
  return `<div class="note">هر خبر با تاریخ و ساعت دقیق انتشار (شمسی) بایگانی می‌شود و تا ${esc(nf(retentionDays))} روز نگه داشته می‌شود.</div>
  <div class="rows">${days.map((d) => `
    <a class="row-item arch-day" href="#/archive/${esc(d.key)}">
      <span class="ico-circle">${esc(toFaDigits(d.key.slice(8)))}</span>
      <span class="row-main"><b>${esc(d.label)}</b><small>${d.count ? `${esc(nf(d.count))} خبر` : 'باز کردن'}</small></span>
      <span class="row-end">${icon('chevronStart', { size: 14 })}</span>
    </a>`).join('')}</div>`;
}

/* ------------------------------------------------------------------ */
/* احراز هویت و تنظیمات                                                 */
/* ------------------------------------------------------------------ */

export function renderAuthModal(mode = 'login', error = '') {
  const isLogin = mode === 'login';
  return `<div class="auth-modal">
    <span class="wordmark">Rasad</span>
    <h2>${isLogin ? 'ورود به حساب کاربری' : 'ثبت‌نام کنید تا خبرها را پسند کنید، نظر بدهید و خبرگزاری‌ها را دنبال کنید.'}</h2>
    ${error ? `<div class="alert danger">${esc(error)}</div>` : ''}
    <form data-auth-form="${mode}">
      ${!isLogin ? `<input name="displayName" maxlength="40" placeholder="نام و نام خانوادگی">` : ''}
      <input name="username" required minlength="3" maxlength="24" pattern="[A-Za-z0-9_.]{3,24}" placeholder="نام کاربری" dir="ltr" autocomplete="username">
      ${!isLogin ? `<input name="email" type="email" dir="ltr" placeholder="ایمیل (اختیاری)">` : ''}
      <input name="password" type="password" required minlength="6" placeholder="رمز عبور" dir="ltr" autocomplete="${isLogin ? 'current-password' : 'new-password'}">
      <button class="btn btn-primary block" type="submit">${isLogin ? 'ورود' : 'ثبت‌نام'}</button>
    </form>
    ${!isLogin ? `<p class="muted tiny" style="margin-top:10px">حساب شما روی همین دستگاه و (در صورت فعال‌سازی) روی مخزن گیت‌هاب ذخیره می‌شود.</p>` : ''}
    <div class="or">یا</div>
    <p class="am-switch">${isLogin ? 'حساب کاربری ندارید؟' : 'حساب کاربری دارید؟'}
      <button class="txt-btn" data-switch-auth="${isLogin ? 'register' : 'login'}">${isLogin ? 'ثبت‌نام کنید' : 'وارد شوید'}</button>
    </p>
  </div>`;
}

export function renderSettings({ settings = {}, stats = {}, github = {}, user = null, bundle = null, backendId = '' }) {
  const toggle = (key, label, hint = '') => `<label class="row-item">
    <span class="row-main"><b>${label}</b>${hint ? `<small>${hint}</small>` : ''}</span>
    <input class="switch" type="checkbox" data-setting="${key}" ${settings[key] ? 'checked' : ''}>
  </label>`;
  const theme = settings.theme || 'system';

  return `<div class="settings">
    <div class="row-head">حساب کاربری</div>
    ${user ? `<div class="row-item">${avatar(user, { size: 44 })}<span class="row-main"><b>${esc(user.displayName || user.username)}</b><small>${esc(user.username)}</small></span>
        <span class="row-end"><button class="txt-btn danger" data-logout>خروج</button></span></div>`
      : `<div class="row-item"><span class="ico-circle">${icon('user', { size: 20 })}</span><span class="row-main"><b>وارد نشده‌اید</b><small>برای نظر، پسند و دنبال کردن</small></span>
        <span class="row-end"><button class="txt-btn" data-auth="login">ورود</button></span></div>`}

    <div class="row-head">دادهٔ آماده (GitHub Actions)</div>
    <div class="stat-line"><span>آخرین بروزرسانی خودکار</span><b>${bundle?.generatedAt ? esc(formatJalali(bundle.generatedAt)) + ' (' + esc(timeAgo(bundle.generatedAt)) + ')' : 'هنوز منتشر نشده'}</b></div>
    <div class="stat-line"><span>فاصلهٔ اجرا</span><b>هر ${esc(toFaDigits(bundle?.intervalMinutes || APP.COLLECT_INTERVAL_MIN))} دقیقه</b></div>
    <div class="stat-line"><span>پست‌های بسته</span><b>${esc(nf(bundle?.counts?.posts || 0))}</b></div>
    <div class="stat-line"><span>دارایی‌ها (تازه / کل)</span><b>${esc(nf(bundle?.counts?.freshAssets || 0))} / ${esc(nf(bundle?.counts?.assets || 0))}</b></div>
    <div class="stat-line"><span>منابع خبری موفق</span><b>${esc(nf(bundle?.counts?.sourcesOk || 0))} / ${esc(nf(bundle?.counts?.sources || 0))}</b></div>
    <div class="row-btns">
      <button class="btn btn-secondary sm" data-refresh-bundle>${icon('refresh', { size: 16 })} بررسی دادهٔ جدید</button>
      <button class="btn btn-secondary sm" data-refresh-now title="فقط در صورت نیاز؛ داده مستقیم از منابع در همین مرورگر خوانده می‌شود">${icon('rss', { size: 16 })} دریافت زنده (آزمایشی)</button>
    </div>
    <div class="note">مرورگر هیچ‌وقت خودش خبر جمع نمی‌کند؛ فقط بستهٔ آمادهٔ منتشرشده را می‌خواند. «دریافت زنده» فقط برای مواقعی است که هنوز اجرای خودکار انجام نشده باشد.</div>

    <div class="row-head">نمایش</div>
    <div class="row-item"><span class="row-main"><b>پوسته</b><small>پیش‌فرض: هماهنگ با سیستم</small></span>
      <span class="seg" data-theme-seg>
        <button class="${theme === 'system' ? 'active' : ''}" data-theme="system">سیستم</button>
        <button class="${theme === 'dark' ? 'active' : ''}" data-theme="dark">تیره</button>
        <button class="${theme === 'light' ? 'active' : ''}" data-theme="light">روشن</button>
      </span></div>
    ${toggle('reduceMotion', 'کاهش انیمیشن', 'برای دستگاه‌های ضعیف‌تر')}
    ${toggle('autoRefresh', 'بررسی خودکار دادهٔ جدید', 'هر ۵ دقیقه بستهٔ آماده دوباره خوانده می‌شود')}
    ${toggle('onlyFollowing', 'فید فقط از دنبال‌شده‌ها', 'مثل حالت Following اینستاگرام')}
    <label class="row-item"><span class="row-main"><b>تعداد پست در هر بار</b></span>
      <input type="number" min="10" max="120" value="${esc(settings.feedSize || 30)}" data-setting-num="feedSize" style="width:72px;text-align:center"></label>

    <div class="row-head">ذخیره‌سازی محلی</div>
    <div class="stat-line"><span>لایهٔ فعال</span><b>${esc(backendId || '—')}</b></div>
    <div class="stat-line"><span>پست‌های کش‌شده</span><b>${esc(nf(stats.posts || 0))}</b></div>
    <div class="stat-line"><span>نقاط قیمتی</span><b>${esc(nf(stats.pricePoints || 0))}</b></div>
    <div class="stat-line"><span>کاربران / نظرها</span><b>${esc(nf(stats.users || 0))} / ${esc(nf(stats.comments || 0))}</b></div>
    <div class="row-btns">
      <button class="btn btn-secondary sm" data-export>خروجی JSON</button>
      <button class="btn btn-secondary sm" data-import>ورود JSON</button>
      <button class="btn btn-secondary sm btn-danger" data-reset>پاک‌سازی دادهٔ محلی</button>
    </div>

    <div class="row-head">همگام‌سازی با گیت‌هاب</div>
    <div class="note">GitHub Pages دیتابیس ندارد؛ با یک توکن دسترسی محدود (fine-grained PAT با دسترسی Contents) حساب‌ها، دنبال‌شونده‌ها و نظرها روی مخزن ذخیره می‌شوند تا با پاک شدن مرورگر از بین نروند.</div>
    <div class="field">توکن (PAT)<input name="ghToken" type="password" dir="ltr" value="${esc(github.token || '')}" placeholder="github_pat_..."></div>
    <div class="two-col">
      <label class="field">مالک<input name="ghOwner" type="text" dir="ltr" value="${esc(github.owner || '')}" placeholder="rahimf79"></label>
      <label class="field">مخزن<input name="ghRepo" type="text" dir="ltr" value="${esc(github.repo || '')}" placeholder="Rasad"></label>
      <label class="field">شاخه<input name="ghBranch" type="text" dir="ltr" value="${esc(github.branch || 'main')}"></label>
      <label class="field">پوشه<input name="ghDir" type="text" dir="ltr" value="${esc(github.dir || 'user-data')}"></label>
    </div>
    <div class="row-btns">
      <button class="btn btn-primary sm" data-gh-save>ذخیره و فعال‌سازی</button>
      <button class="btn btn-secondary sm" data-gh-test>آزمون اتصال</button>
      <button class="btn btn-secondary sm" data-gh-pull>دریافت از گیت‌هاب</button>
    </div>
    <div class="gh-status" data-gh-status>${esc(github.status || '')}</div>

    <div class="row-head">منابع خبری</div>
    <div class="chips" style="padding:0 16px 8px">${(settings.agencyIds || []).map((id) => `<span class="chip">${esc(id)}</span>`).join('')}</div>
    <label class="field">افزودن فید RSS دلخواه (هر خط یک آدرس — به‌عنوان یک صفحهٔ خبرگزاری جدید ثبت می‌شود؛ فقط در «دریافت زنده» استفاده می‌شود)
      <textarea rows="3" data-setting="customFeeds" dir="ltr" placeholder="https://example.com/rss">${esc((settings.customFeeds || []).join('\n'))}</textarea>
    </label>
    <div class="row-btns"><button class="btn btn-primary sm" data-save-settings>ذخیرهٔ تنظیمات</button></div>

    <div class="note">نگهداری آرشیو: اخبار ${esc(nf(settings.newsDays ?? APP.RETENTION.newsDays))} روز · قیمت‌ها ${esc(nf(settings.priceDays ?? APP.RETENTION.priceDays))} روز · نسخهٔ ${esc(APP.version)}</div>
  </div>`;
}

/** وضعیت داده برای نمایش‌های کوچک */
export function renderSyncStatus(state) {
  const map = { idle: 'آماده', running: 'در حال دریافت…', done: 'بروزرسانی شد', error: 'خطا در دریافت', offline: 'آفلاین' };
  return `<span class="pill sync-pill ${esc(state.status)}" title="${esc(state.detail || '')}">${esc(map[state.status] || state.status)}${state.at ? ` · ${esc(formatJalali(state.at))}` : ''}</span>`;
}
