/**
 * هستهٔ برنامهٔ رصد: بارگذاری داده، روتینگ، رندر و رویدادها.
 * این ماژول در زمان import به DOM دست نمی‌زند؛ همه‌چیز داخل boot() اتفاق می‌افتد.
 */

import { APP, AGENCIES, PRICE_ENTITIES, PRICE_GROUPS, TOPICS } from './config.js';
import { Store, createStore, AuthError, createGithubBackend } from './db.js';
import { buildStories } from './posts.js';
import { searchAll, pushRecent } from './search.js';
import {
  avatar, renderStoryRail, renderStoryViewer, renderPost, renderPostDetail, renderProfile,
  renderExplore, renderReel, renderPriceCard, renderPriceDetail, renderCommentBox, renderCommentList,
  renderAuthModal, renderSettings, renderSearchHome, renderSearchResults, renderSyncStatus, followButton
} from './render.js';
import { parseHash, href } from './router.js';
import {
  collectNews, collectServatmandi, snapshotsToPoints, collectCars, carsToAssets,
  loadArchiveIndex, loadArchivedPosts, loadArchivedPrices
} from './collect.js';
import { esc, nf, money, pct, dirCls, timeAgo, debounce, gradientFor, toFaDigits } from './lib/util.js';
import { formatJalali, formatJalaliLong } from './lib/jalali.js';

const DEFAULT_SETTINGS = {
  lightMode: false,
  reduceMotion: false,
  autoRefresh: true,
  onlyFollowing: false,
  feedSize: 30,
  newsDays: APP.RETENTION.newsDays,
  priceDays: APP.RETENTION.priceDays,
  agencyIds: AGENCIES.map((a) => a.id),
  customFeeds: [],
  recentSearches: []
};

export const state = {
  store: null,
  agencies: [...AGENCIES],
  posts: [],
  assets: new Map(),
  series: new Map(),
  cars: [],
  user: null,
  settings: { ...DEFAULT_SETTINGS },
  route: { name: 'home', params: {}, query: {} },
  stories: [],
  profileTab: 'posts',
  priceRange: '30d',
  priceGroup: 'all',
  story: null,
  sync: { status: 'idle', at: null, detail: '' },
  archiveIndex: null,
  env: {}
};

/* ------------------------------------------------------------------ */
/* ابزارهای DOM                                                        */
/* ------------------------------------------------------------------ */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function toast(message, kind = 'info') {
  const host = $('#toasts');
  if (!host) return;
  const node = el(`<div class="toast ${kind}">${esc(message)}</div>`);
  host.appendChild(node);
  setTimeout(() => { node.classList.add('out'); setTimeout(() => node.remove(), 400); }, 2600);
}

function setSync(status, detail = '') {
  state.sync = { status, detail, at: Date.now() };
  const host = $('#syncStatus');
  if (host) host.innerHTML = renderSyncStatus(state.sync);
}

export function openModal(html, { title = '' } = {}) {
  const ov = $('#overlay');
  if (!ov) return;
  ov.innerHTML = `<div class="modal glass">${title ? `<div class="modal-head"><h3>${esc(title)}</h3></div>` : ''}
    <button class="icon-btn modal-x" data-close-modal aria-label="بستن">✕</button>
    <div class="modal-body">${html}</div></div>`;
  ov.classList.add('open');
  document.body.classList.add('modal-open');
}

export function closeModal() {
  const ov = $('#overlay');
  if (!ov) return;
  ov.classList.remove('open');
  ov.innerHTML = '';
  document.body.classList.remove('modal-open');
}

/* ------------------------------------------------------------------ */
/* داده                                                                */
/* ------------------------------------------------------------------ */

async function loadSettings() {
  const saved = await state.store.getSetting('app', null);
  state.settings = { ...DEFAULT_SETTINGS, ...(saved || {}) };
  applyTheme();
}

function applyTheme() {
  document.documentElement.dataset.theme = state.settings.lightMode ? 'light' : 'dark';
  document.documentElement.dataset.motion = state.settings.reduceMotion ? 'reduced' : 'full';
}

/** بارگذاری آرشیو منتشرشده روی Pages + دادهٔ محلی */
export async function loadPersisted() {
  const fetchImpl = state.env.fetchImpl;
  const base = state.env.dataBase || APP.DATA_BASE;

  const [index, localPosts] = await Promise.all([
    loadArchiveIndex({ base, fetchImpl }),
    state.store.allPosts()
  ]);
  state.archiveIndex = index;

  const localMap = new Map(localPosts.map((p) => [p.id, p]));

  if (index?.news?.files?.length) {
    const archived = await loadArchivedPosts({ base, files: index.news.files, fetchImpl, limit: 10 });
    for (const p of archived) if (p?.id && !localMap.has(p.id)) localMap.set(p.id, p);
  }

  state.posts = [...localMap.values()].sort((a, b) => b.date - a.date);
  if (state.posts.length !== localPosts.length) await state.store.putPosts(state.posts);

  const keys = PRICE_ENTITIES.map((e) => e.key);
  const archivedPrices = await loadArchivedPrices({ base, keys, fetchImpl });
  for (const [key, series] of Object.entries(archivedPrices)) {
    if (series?.length) await state.store.putPricePoints(key, series);
  }
  for (const key of keys) {
    state.series.set(key, await state.store.getPriceHistory(key));
  }
}

function applySnapshots(snapshots) {
  for (const s of snapshots) state.assets.set(s.key, s);
}

/** اجرای یک بار جمع‌آوری زنده در مرورگر */
export async function refreshLive({ silent = false } = {}) {
  if (!silent) setSync('running');
  const now = Date.now();
  let newsCount = 0, assetCount = 0;

  try {
    const { posts, report } = await collectNews({
      agencies: state.agencies,
      fetchImpl: state.env.fetchImpl,
      throttle: state.env.throttle ?? 120,
      log: (m) => console.debug('[rasad]', m)
    });
    if (posts.length) {
      await state.store.putPosts(posts);
      newsCount = posts.length;
    }
    const failed = report.filter((r) => !r.count);
    state.sync = { status: 'done', at: Date.now(), detail: `${report.length - failed.length}/${report.length} منبع` };
  } catch (e) {
    setSync('error', e.message);
  }

  try {
    const { snapshots, errors } = await collectServatmandi(null, { fetchImpl: state.env.fetchImpl, throttle: state.env.throttle ?? 150 });
    applySnapshots(snapshots);
    assetCount = snapshots.length;
    const points = snapshotsToPoints(snapshots);
    for (const [key, pts] of Object.entries(points)) {
      await state.store.putPricePoints(key, pts);
      state.series.set(key, await state.store.getPriceHistory(key));
    }
    if (errors.length) console.debug('[rasad] servatmandi errors', errors.slice(0, 3));
  } catch (e) {
    console.debug('[rasad] prices failed', e.message);
  }

  try {
    const { cars } = await collectCars({ fetchImpl: state.env.fetchImpl, throttle: state.env.throttle ?? 200 });
    state.cars = cars;
    const usd = state.assets.get('usd')?.last || 0;
    for (const car of carsToAssets(cars, { usdRate: usd })) state.assets.set(car.key, car);
  } catch { /* خودرو اختیاری است */ }

  state.posts = await state.store.allPosts();
  await refreshStories();
  setSync('done', `${nf(newsCount)} خبر · ${nf(assetCount)} قیمت`);
  renderRoute();
  return { newsCount, assetCount };
}

async function refreshStories() {
  const seen = await state.store.seenStoryKeys();
  state.stories = buildStories(state.posts, { agencies: state.agencies, seen });
  const rail = $('#storyRail');
  if (rail) rail.innerHTML = renderStoryRail(state.stories);
}

/* ------------------------------------------------------------------ */
/* روتینگ و رندر                                                       */
/* ------------------------------------------------------------------ */

export function renderRoute() {
  state.route = parseHash(typeof location !== 'undefined' ? location.hash : '');
  const view = $('#view');
  if (!view) return;

  $$('.bottom-nav .nav-item').forEach((b) => {
    b.classList.toggle('active', b.dataset.route === state.route.name ||
      (state.route.name === 'post' && b.dataset.route === 'home'));
  });

  const html = {
    home: viewHome,
    post: () => viewPost(state.route.params.id),
    agency: () => viewAgency(state.route.params.handle),
    prices: viewPrices,
    price: () => viewPrice(state.route.params.key),
    search: viewSearch,
    reels: viewReels,
    archive: viewArchive,
    settings: viewSettings,
    me: viewMe
  }[state.route.name] || viewHome;

  view.innerHTML = '';
  const node = el(html() || '<div class="muted center pad">چیزی اینجا نیست.</div>');
  view.appendChild(node);
  window.scrollTo(0, 0);

  if (state.route.name === 'reels') initReels();
  hydrateCurrent();
}

async function postContext(post) {
  const [likedIds, savedIds, comments, following] = await Promise.all([
    state.store.likedIds(),
    state.store.savedIds(),
    state.store.listComments(post.id),
    state.store.isFollowing(post.sourceId)
  ]);
  return {
    liked: likedIds.includes(post.id),
    saved: savedIds.includes(post.id),
    likeCount: likedIds.filter((id) => id === post.id).length + seededLike(post),
    commentCount: comments.length,
    comments,
    following
  };
}

/** لایک اولیهٔ نمایشی بر اساس شناسهٔ پایدار پست (بدون سرور) */
function seededLike(post) {
  let h = 0;
  const s = String(post.id);
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
  return 3 + (h % 140);
}

export function viewHome() {
  return `<div class="feed" data-home-view><div class="loading center pad"><div class="spinner"></div></div></div>`;
}

export async function hydrateHome() {
  const host = $('[data-home-view]');
  if (!host) return;

  const following = await state.store.followings();
  const useFollowing = state.settings.onlyFollowing && following.length;
  const sourceIds = useFollowing ? following : undefined;
  const posts = await state.store.queryPosts({ sourceIds, limit: state.settings.feedSize });

  const parts = [];
  parts.push(`<div class="home-head glass">
    <div>
      <h2>فید ${useFollowing ? 'دنبال‌شده‌ها' : 'خبرگزاری‌ها'}</h2>
      <p class="muted small">اخبار به‌عنوان پست و استوری از صفحهٔ هر خبرگزاری منتشر می‌شود. استوری‌ها ۲۴ ساعته‌اند؛ پست‌ها تاریخ انقضا ندارند و در آرشیو می‌مانند.</p>
    </div>
    <div class="home-head-actions">
      <button class="chip ${state.settings.onlyFollowing ? 'active' : ''}" data-toggle-following>فقط دنبال‌شده‌ها</button>
      <button class="chip" data-refresh-now>بروزرسانی</button>
    </div>
  </div>`);

  if (!state.posts.length) {
    parts.push(`<div class="glass pad center">
      <div class="spinner"></div>
      <p class="muted">در حال جمع‌آوری اخبار از خبرگزاری‌ها…</p>
      <p class="muted small">اولین بار ممکن است چند ثانیه طول بکشد. نتیجه هم روی دستگاه شما و هم در آرشیو مخزن ذخیره می‌شود.</p>
    </div>`);
  }

  for (const p of posts) parts.push(renderPost(p, await postContext(p)));
  host.innerHTML = parts.join('');
  bindFollow(host);
}

export function viewPost(id) {
  const post = state.posts.find((p) => p.id === id);
  if (!post) return `<div class="glass pad center muted">پست پیدا نشد. <a class="link" href="#/">بازگشت</a></div>`;

  return `<div class="post-detail-wrap" data-post-detail="${esc(post.id)}">
    <div class="loading center pad"><div class="spinner"></div></div>
  </div>`;
}

export async function hydratePostDetail() {
  const wrap = $('[data-post-detail]');
  if (!wrap) return;
  const id = wrap.dataset.postDetail;
  const post = await state.store.getPost(id);
  if (!post) { wrap.innerHTML = '<div class="glass pad center muted">پست پیدا نشد.</div>'; return; }
  const ctx = await postContext(post);
  wrap.innerHTML = renderPostDetail(post, ctx) + `
    <div class="glass pad" id="comments">
      <h3 class="sec-title">💬 کامنت‌ها <small>(${esc(nf(ctx.commentCount))})</small></h3>
      ${renderCommentBox(state.user, { targetId: post.id, placeholder: 'نظرتان را دربارهٔ این خبر بنویسید…' })}
      <div data-comments-for="${esc(post.id)}">${renderCommentList(ctx.comments, state.user)}</div>
    </div>`;
  bindCommentActions(wrap, post.id);
}

export function viewAgency(handle) {
  const agency = state.agencies.find((a) => a.handle === handle || a.id === handle);
  if (!agency) return `<div class="glass pad center muted">صفحهٔ این خبرگزاری پیدا نشد. <a class="link" href="#/">بازگشت</a></div>`;
  return `<div data-agency-view="${esc(agency.id)}"><div class="loading center pad"><div class="spinner"></div></div></div>`;
}

export async function hydrateAgency() {
  const host = $('[data-agency-view]');
  if (!host) return;
  const id = host.dataset.agencyView;
  const agency = state.agencies.find((a) => a.id === id || a.handle === id);
  if (!agency) return;

  const [posts, following, seen] = await Promise.all([
    state.store.queryPosts({ sourceId: agency.id, limit: 120 }),
    state.store.isFollowing(agency.id),
    state.store.seenStoryKeys()
  ]);
  const stories = buildStories(posts, { agencies: [agency], seen });
  const followers = await followerCount(agency.id);

  host.innerHTML = renderProfile(agency, {
    posts,
    following,
    tab: state.profileTab,
    storyCount: stories[0]?.count || 0,
    followers,
    counts: { posts: posts.length, stories: stories[0]?.count || 0 }
  });

  host.querySelectorAll('[data-ptab]').forEach((b) => {
    b.onclick = () => { state.profileTab = b.dataset.ptab; hydrateAgency(); };
  });
  bindFollow(host);
}

/** شمارندهٔ دنبال‌کننده: مجموع کاربران محلی + پایهٔ پایدار */
async function followerCount(agencyId) {
  const users = await state.store.listUsers();
  let n = 0;
  for (const u of users) {
    const rec = await state.store.backend.get('follows', u.id);
    if (rec?.list?.includes(agencyId)) n++;
  }
  let h = 0;
  for (let i = 0; i < agencyId.length; i++) h = (h * 31 + agencyId.charCodeAt(i)) >>> 0;
  return n + 120 + (h % 4000);
}

export function viewPrices() {
  return `<div data-prices-view><div class="loading center pad"><div class="spinner"></div></div></div>`;
}

export async function hydratePrices() {
  const host = $('[data-prices-view]');
  if (!host) return;

  const groups = PRICE_GROUPS.map((g) =>
    `<button class="chip ${state.priceGroup === g.id ? 'active' : ''}" data-pgroup="${g.id}">${g.label}</button>`).join('');

  const list = [...state.assets.values()].filter((a) => state.priceGroup === 'all' || a.group === state.priceGroup);
  const ordered = list.sort((a, b) => Number(!!b.featured) - Number(!!a.featured) || a.name.localeCompare(b.name, 'fa'));

  const missing = PRICE_ENTITIES.filter((e) => !state.assets.has(e.key)).length;

  host.innerHTML = `
    <header class="page-head glass">
      <h2>💹 بازار</h2>
      <p class="muted small">منبع اصلی: <b>ثروتمندی</b> (servatmandi.com) برای ارز، طلا، سکه، نفت، گاز و انرژی. قیمت خودرو از <b>باما</b>.
      روی هر دارایی بزنید تا نمودار کامل و بخش کامنت باز شود.</p>
      <div class="chips">${groups}</div>
    </header>
    ${missing ? `<div class="note glass">⏳ ${esc(nf(missing))} دارایی هنوز داده ندارد؛ با اولین اجرای جمع‌آوری (GitHub Actions یا دکمهٔ بروزرسانی) پر می‌شود.</div>` : ''}
    <div class="price-grid">${ordered.map((a) => renderPriceCard(a, state.series.get(a.key) || [])).join('') ||
      '<div class="muted center pad glass">داده‌ای برای این گروه ثبت نشده است.</div>'}</div>`;

  host.querySelectorAll('[data-pgroup]').forEach((b) => {
    b.onclick = () => { state.priceGroup = b.dataset.pgroup; hydratePrices(); };
  });
}

export function viewPrice(key) {
  return `<div data-price-view="${esc(key)}" data-range="${esc(state.priceRange)}"><div class="loading center pad"><div class="spinner"></div></div></div>`;
}

export async function hydratePrice() {
  const host = $('[data-price-view]');
  if (!host) return;
  const key = host.dataset.priceView;
  state.priceRange = host.dataset.range || state.priceRange;

  let asset = state.assets.get(key);
  if (!asset) {
    // تلاش برای ساخت از آخرین نقطهٔ آرشیو
    const series = state.series.get(key) || await state.store.getPriceHistory(key);
    const ent = PRICE_ENTITIES.find((e) => e.key === key);
    if (ent && series.length) {
      const lastPoint = series[series.length - 1];
      const firstPoint = series[0];
      asset = {
        ...ent, unitLabel: ent.unit === 'rial' ? 'تومان' : ent.unit === 'usd' ? 'دلار' : '',
        last: lastPoint.v, first: firstPoint.v, high: lastPoint.v, low: lastPoint.v, prev: firstPoint.v,
        change: lastPoint.v - firstPoint.v,
        changePct: firstPoint.v ? ((lastPoint.v - firstPoint.v) / firstPoint.v) * 100 : 0,
        time: lastPoint.t, source: 'ثروتمندی',
        sourceUrl: `https://servatmandi.com/Entity/Summary/${ent.code}`
      };
      state.assets.set(key, asset);
    }
  }
  if (!asset) {
    host.innerHTML = `<div class="glass pad center muted">این دارایی شناخته نشده است. <a class="link" href="#/prices">بازگشت به بازار</a></div>`;
    return;
  }

  const series = state.series.get(key) || [];
  const targetId = `price:${key}`;
  const [comments] = await Promise.all([state.store.listComments(targetId)]);

  host.innerHTML = renderPriceDetail(asset, series, {
    rangeId: state.priceRange,
    comments,
    user: state.user,
    commentCount: comments.length
  });

  host.querySelectorAll('[data-range]').forEach((b) => {
    b.onclick = () => { state.priceRange = b.dataset.range; hydratePrice(); };
  });
  initChartTips(host);
  bindCommentActions(host, targetId);
}

/** tooltip نمودار: «در فلان زمان این قیمت بوده» */
export function initChartTips(root = document) {
  root.querySelectorAll('.chart-wrap').forEach((wrap) => {
    const tip = wrap.querySelector('.chart-tip');
    const unit = wrap.dataset.unit || '';
    const show = (dot) => {
      const t = +dot.dataset.t;
      const v = +dot.dataset.v;
      const src = dot.dataset.src || 'ثروتمندی';
      tip.hidden = false;
      tip.innerHTML = `<b>${esc(formatJalali(t, { seconds: true }))}</b>
        <span>${esc(money(v))} ${esc(unit)}</span>
        <small>${esc(src)}</small>`;
      const box = wrap.getBoundingClientRect();
      const db = dot.getBoundingClientRect();
      tip.style.left = `${Math.min(Math.max(db.left - box.left, 8), box.width - 150)}px`;
      tip.style.top = `${Math.max(db.top - box.top - 62, 4)}px`;
    };
    wrap.querySelectorAll('.chart-dot').forEach((dot) => {
      dot.addEventListener('mouseenter', () => show(dot));
      dot.addEventListener('click', () => show(dot));
      dot.addEventListener('touchstart', (e) => { e.preventDefault(); show(dot); }, { passive: false });
    });
    wrap.addEventListener('mouseleave', () => { tip.hidden = true; });
  });
}

export function viewSearch() {
  const q = state.route.query.q || '';
  const shell = `<div class="search-page">
    <div class="search-head glass">
      <span class="s-icon">🔎</span>
      <input id="searchInput" type="search" placeholder="جست‌وجوی خبر، خبرگزاری، قیمت یا موضوع…" value="${esc(q)}" autocomplete="off">
      ${q ? `<button class="icon-btn" data-clear-search aria-label="پاک کردن">✕</button>` : ''}
    </div>
    <div id="searchBody">${q ? '<div class="loading center pad"><div class="spinner"></div></div>' : ''}</div>
  </div>`;
  if (!q) {
    return shell.replace('<div id="searchBody"></div>',
      `<div id="searchBody">${renderSearchHome({ recent: state.settings.recentSearches, trending: Object.keys(TOPICS) })}</div>`);
  }
  return shell;
}

export async function hydrateSearch() {
  const body = $('#searchBody');
  const input = $('#searchInput');
  if (!body) return;
  const q = state.route.query.q || '';

  if (input) {
    input.oninput = debounce((e) => {
      const v = e.target.value.trim();
      history.replaceState(null, '', v ? `#/search?q=${encodeURIComponent(v)}` : '#/search');
      state.route = parseHash(location.hash);
      hydrateSearch();
    }, 220);
    input.onkeydown = (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        state.settings.recentSearches = pushRecent(state.settings.recentSearches, input.value.trim());
        state.store.setSetting('app', state.settings);
      }
    };
  }

  if (!q) {
    const explore = state.posts.slice(0, 33);
    body.innerHTML =
      renderSearchHome({ recent: state.settings.recentSearches, trending: Object.keys(TOPICS) }) +
      `<h3 class="sec-title">🧭 اکسپلور</h3>` +
      renderExplore(explore);
    body.querySelector('[data-clear-recent]')?.addEventListener('click', () => {
      state.settings.recentSearches = [];
      state.store.setSetting('app', state.settings);
      hydrateSearch();
    });
    return;
  }

  const res = searchAll({
    q,
    posts: state.posts,
    agencies: state.agencies,
    assets: [...state.assets.values()],
    limit: 30
  });
  body.innerHTML = renderSearchResults(res);
}

/** لیست ریلزها — یک تابع مشترک تا رندر و آمار همیشه هم‌خوان باشند */
function reelList() {
  return state.posts.filter((p) => p.img || p.title).slice(0, 40);
}

export function viewReels() {
  const reels = reelList();
  if (!reels.length) return '<div class="glass pad center muted">ریلز هنوز خالی است؛ پس از جمع‌آوری اخبار پر می‌شود.</div>';
  return `<div class="reels-stage" data-reels>${reels.map((p, i) =>
    renderReel(p, { index: i, total: reels.length })).join('')}</div>
    <div class="reels-hint">↑↓ یا کشیدن برای ریلز بعدی</div>`;
}

export function initReels() {
  const stage = $('[data-reels]');
  if (!stage) return;
  const reels = reelList();
  hydrateReelMeta(stage, reels);
  stage.addEventListener('scroll', () => {
    const i = Math.round(stage.scrollTop / (stage.clientHeight || 1));
    $$('.reel').forEach((r, k) => r.classList.toggle('current', k === i));
  }, { passive: true });
}

async function hydrateReelMeta(stage, reels) {
  const liked = await state.store.likedIds();
  stage.querySelectorAll('.reel').forEach(async (node, i) => {
    const post = reels[i];
    if (!post) return;
    const n = await state.store.countComments(post.id);
    const rail = node.querySelector('.reel-rail');
    if (!rail) return;
    rail.querySelector('[data-like] span').textContent = liked.includes(post.id) ? '❤️' : '🤍';
    rail.querySelector('[data-like] small').textContent = nf(seededLike(post) + (liked.includes(post.id) ? 1 : 0));
    const cmt = rail.querySelectorAll('.rail-btn')[1];
    if (cmt) cmt.querySelector('small').textContent = nf(n);
  });
}

export function viewArchive() {
  const days = new Map();
  for (const p of state.posts) {
    const d = formatJalaliLong(p.date);
    days.set(d, (days.get(d) || 0) + 1);
  }
  const rows = [...days.entries()].sort((a, b) => b[0].localeCompare(a[0], 'fa')).slice(0, 60);

  return `<section class="archive-page">
    <header class="page-head glass">
      <h2>🗂️ آرشیو با تاریخ دقیق انتشار</h2>
      <p class="muted small">هر خبر با تاریخ و ساعت دقیق انتشار (شمسی) بایگانی می‌شود. GitHub Actions هر ۳۰ دقیقه آرشیو را به‌روز می‌کند و داده‌های قدیمی‌تر از ${esc(nf(state.settings.newsDays))} روز را پاک می‌کند.</p>
    </header>
    ${rows.length ? `<div class="arch-days">${rows.map(([d, c]) =>
      `<a class="arch-day glass" href="#/search?q=${encodeURIComponent(d)}"><b>${esc(d)}</b><span>${esc(nf(c))} خبر</span></a>`).join('')}</div>`
      : '<div class="glass pad center muted">آرشیو خالی است.</div>'}
  </section>`;
}

export function viewSettings() {
  return `<div data-settings-view><div class="loading center pad"><div class="spinner"></div></div></div>`;
}

export async function hydrateSettings() {
  const host = $('[data-settings-view]');
  if (!host) return;
  const stats = await state.store.stats();
  const github = (await state.store.getSetting('github', {})) || {};
  host.innerHTML = renderSettings({
    settings: state.settings,
    stats: { ...stats, backend: state.store.backend.id },
    github,
    user: state.user
  });

  host.querySelectorAll('[data-setting]').forEach((input) => {
    if (input.type === 'checkbox') {
      input.onchange = () => {
        state.settings[input.dataset.setting] = input.checked;
        state.store.setSetting('app', state.settings);
        applyTheme();
      };
    }
  });
  const feed = host.querySelector('[data-setting-num="feedSize"]');
  if (feed) feed.onchange = () => {
    state.settings.feedSize = Math.max(10, Math.min(120, +feed.value || 30));
    state.store.setSetting('app', state.settings);
  };

  host.querySelector('[data-logout]')?.addEventListener('click', async () => {
    await state.store.logout();
    state.user = null;
    updateAuthChip();
    toast('از حساب خارج شدید');
    renderRoute();
  });

  host.querySelector('[data-export]')?.addEventListener('click', async () => {
    const dump = await state.store.exportAll();
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `rasad-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    toast('فایل پشتیبان دانلود شد', 'ok');
  });

  host.querySelector('[data-import]')?.addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/json';
    inp.onchange = async () => {
      const file = inp.files?.[0];
      if (!file) return;
      const dump = JSON.parse(await file.text());
      const n = await state.store.importAll(dump);
      toast(`${nf(n)} رکورد وارد شد`, 'ok');
      await loadPersisted();
      renderRoute();
    };
    inp.click();
  });

  host.querySelector('[data-reset]')?.addEventListener('click', async () => {
    if (!confirm('همهٔ دادهٔ محلی (حساب‌ها، کامنت‌ها، آرشیو) پاک شود؟')) return;
    for (const s of ['posts', 'prices', 'comments', 'users', 'likes', 'saves', 'follows', 'seen', 'settings']) {
      await state.store.backend.clear(s);
    }
    state.posts = [];
    state.assets.clear();
    state.series.clear();
    state.user = null;
    toast('دادهٔ محلی پاک شد', 'warn');
    renderRoute();
  });

  host.querySelector('[data-gh-save]')?.addEventListener('click', async () => {
    const g = readGithubForm(host);
    await state.store.setSetting('github', g);
    toast(g.token ? 'همگام‌سازی گیت‌هاب فعال شد' : 'همگام‌سازی غیرفعال شد', 'ok');
    setGhStatus(host, g.token ? 'ذخیره شد ✓' : 'غیرفعال');
  });

  host.querySelector('[data-gh-test]')?.addEventListener('click', async () => {
    const g = readGithubForm(host);
    try {
      const res = await (state.env.fetchImpl || fetch)(`https://api.github.com/repos/${g.owner}/${g.repo}`, {
        headers: { Authorization: `Bearer ${g.token}`, Accept: 'application/vnd.github+json' }
      });
      setGhStatus(host, res.ok ? `اتصال برقرار ✓ (${g.owner}/${g.repo})` : `خطا: HTTP ${res.status}`);
    } catch (e) {
      setGhStatus(host, `خطا: ${e.message}`);
    }
  });

  host.querySelector('[data-gh-pull]')?.addEventListener('click', async () => {
    const g = readGithubForm(host);
    try {
      const remote = createGithubBackend(g);
      const n = await pullFromGithub(remote);
      setGhStatus(host, `${nf(n)} رکورد از گیت‌هاب دریافت شد ✓`);
      await loadPersisted();
      renderRoute();
    } catch (e) {
      setGhStatus(host, `خطا: ${e.message}`);
    }
  });

  host.querySelector('[data-save-settings]')?.addEventListener('click', async () => {
    const ta = host.querySelector('[data-setting="customFeeds"]');
    state.settings.customFeeds = (ta?.value || '').split('\n').map((s) => s.trim()).filter(Boolean);
    rebuildAgencies();
    await state.store.setSetting('app', state.settings);
    toast('تنظیمات ذخیره شد', 'ok');
  });
}

function readGithubForm(host) {
  const v = (n) => host.querySelector(`[name="${n}"]`)?.value.trim() || '';
  return { token: v('ghToken'), owner: v('ghOwner'), repo: v('ghRepo'), branch: v('ghBranch') || 'main', dir: v('ghDir') || 'user-data' };
}

function setGhStatus(host, text) {
  const node = host.querySelector('[data-gh-status]');
  if (node) node.textContent = text;
}

async function pullFromGithub(remote) {
  let n = 0;
  for (const store of ['users', 'comments', 'follows', 'likes', 'saves']) {
    const rows = await remote.all(store);
    for (const row of rows) {
      const key = row.id || row.userId;
      if (!key) continue;
      await state.store.backend.set(store, key, row);
      n++;
    }
  }
  return n;
}

function rebuildAgencies() {
  const custom = (state.settings.customFeeds || []).map((url, i) => {
    const host = url.replace(/^https?:\/\//, '').split('/')[0].replace(/\./g, '_');
    return {
      id: `custom_${host}_${i}`, handle: `feed_${host}`, name: host,
      full: url, feeds: [url], site: url, cat: 'سفارشی',
      color: gradientFor(url), bio: 'فید افزوده‌شده توسط کاربر', verified: false
    };
  });
  state.agencies = [...AGENCIES, ...custom];
}

export function viewMe() {
  if (!state.user) {
    return `<section class="me-page">
      <div class="glass pad center">
        <div class="big-lock">🔐</div>
        <h2>وارد نشده‌اید</h2>
        <p class="muted">برای کامنت گذاشتن، پسندیدن و دنبال کردن خبرگزاری‌ها یک حساب کاربری بسازید.</p>
        <div class="row-btns center">
          <button class="btn btn-primary" data-auth="login">ورود</button>
          <button class="btn btn-ghost" data-auth="register">ثبت‌نام</button>
        </div>
      </div>
    </section>`;
  }
  return `<section class="me-page" data-me-view><div class="loading center pad"><div class="spinner"></div></div></section>`;
}

export async function hydrateMe() {
  const host = $('[data-me-view]');
  if (!host || !state.user) return;
  const [followings, savedIds, stats] = await Promise.all([
    state.store.followings(), state.store.savedIds(), state.store.stats()
  ]);
  const savedPosts = state.posts.filter((p) => savedIds.includes(p.id)).slice(0, 12);

  host.innerHTML = `
    <header class="profile-head glass">
      ${avatar(state.user, { size: 92 })}
      <div class="profile-id">
        <h1>${esc(state.user.displayName || state.user.username)}</h1>
        <div class="handle">@${esc(state.user.username)}</div>
        <div class="profile-stats">
          <div><b>${esc(nf(followings.length))}</b><span>دنبال‌شده</span></div>
          <div><b>${esc(nf(savedPosts.length))}</b><span>ذخیره‌شده</span></div>
          <div><b>${esc(nf(stats.comments))}</b><span>کامنت</span></div>
        </div>
        <div class="profile-actions">
          <a class="btn btn-ghost sm" href="#/settings">تنظیمات</a>
          <button class="btn btn-ghost sm" data-logout>خروج از حساب</button>
        </div>
      </div>
    </header>
    <h3 class="sec-title">📌 خبرگزاری‌های دنبال‌شده</h3>
    <div class="acc-list">${followings.length ? followings.map((id) => {
      const a = state.agencies.find((x) => x.id === id);
      if (!a) return '';
      return `<a class="acc glass" href="#/u/${esc(a.handle)}">${avatar(a, { size: 44 })}
        <span class="acc-id"><b>${esc(a.name)}</b><small>@${esc(a.handle)}</small></span></a>`;
    }).join('') : '<div class="muted pad">هنوز خبرگزاری‌ای را دنبال نمی‌کنید.</div>'}</div>
    <h3 class="sec-title">🔖 ذخیره‌شده‌ها</h3>
    ${savedPosts.length ? `<div class="profile-grid">${savedPosts.map((p) =>
      `<a class="grid-cell" href="#/p/${esc(p.id)}" style="${p.img ? `background-image:url('${esc(p.img)}')` : `background:${gradientFor(p.title)}`}">
        <span class="shade"></span>${!p.img ? `<span class="grid-title">${esc(p.title)}</span>` : ''}</a>`).join('')}</div>`
      : '<div class="muted pad">چیزی ذخیره نکرده‌اید.</div>'}`;

  host.querySelector('[data-logout]')?.addEventListener('click', async () => {
    await state.store.logout();
    state.user = null;
    updateAuthChip();
    renderRoute();
  });
}

/* ------------------------------------------------------------------ */
/* استوری                                                              */
/* ------------------------------------------------------------------ */

export function openStory(index = 0, itemIndex = 0) {
  if (!state.stories[index]) return;
  state.story = { index, itemIndex };
  const ov = $('#storyOverlay');
  if (!ov) return;
  ov.innerHTML = renderStoryViewer(state.stories, index, itemIndex);
  ov.classList.add('open');
  document.body.classList.add('story-open');
  markStorySeen(index, itemIndex);
  startStoryTimer();
  bindStoryControls(ov);
}

export function closeStory() {
  const ov = $('#storyOverlay');
  if (ov) { ov.classList.remove('open'); ov.innerHTML = ''; }
  document.body.classList.remove('story-open');
  state.story = null;
  stopStoryTimer();
}

let storyTimer = null;
function stopStoryTimer() { if (storyTimer) { clearInterval(storyTimer); storyTimer = null; } }

function startStoryTimer() {
  stopStoryTimer();
  storyTimer = setInterval(() => nextStoryItem(), 6000);
}

function nextStoryItem() {
  if (!state.story) return;
  const s = state.stories[state.story.index];
  if (!s) return closeStory();
  if (state.story.itemIndex + 1 < s.items.length) return openStory(state.story.index, state.story.itemIndex + 1);
  if (state.story.index + 1 < state.stories.length) return openStory(state.story.index + 1, 0);
  closeStory();
}

function prevStoryItem() {
  if (!state.story) return;
  if (state.story.itemIndex > 0) return openStory(state.story.index, state.story.itemIndex - 1);
  if (state.story.index > 0) {
    const prev = state.stories[state.story.index - 1];
    return openStory(state.story.index - 1, Math.max(0, prev.items.length - 1));
  }
}

async function markStorySeen(index, itemIndex) {
  const s = state.stories[index];
  const item = s?.items[itemIndex];
  if (!item) return;
  await state.store.markStorySeen(item.id);
}

function bindStoryControls(ov) {
  ov.querySelector('[data-close-story]')?.addEventListener('click', closeStory);
  ov.querySelector('[data-story-next]')?.addEventListener('click', nextStoryItem);
  ov.querySelector('[data-story-prev]')?.addEventListener('click', prevStoryItem);
}

/* ------------------------------------------------------------------ */
/* احراز هویت                                                          */
/* ------------------------------------------------------------------ */

export function openAuth(mode = 'login', error = '') {
  openModal(renderAuthModal(mode, error));
  const host = $('#overlay');
  host.querySelector('[data-switch-auth]')?.addEventListener('click', (e) => {
    openAuth(e.currentTarget.dataset.switchAuth);
  });
  host.querySelector('[data-auth-form]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      state.user = form.dataset.authForm === 'login'
        ? await state.store.login(data.username, data.password)
        : await state.store.register(data);
      state.user = Store.publicUser(state.user);
      await syncUserToGithub();
      closeModal();
      toast(`خوش آمدید ${state.user.displayName || state.user.username}`, 'ok');
      updateAuthChip();
      renderRoute();
    } catch (err) {
      openAuth(form.dataset.authForm, err.message);
    }
  });
}

async function syncUserToGithub() {
  const g = await state.store.getSetting('github', {});
  if (!g?.token || !g?.owner || !g?.repo) return;
  try {
    const remote = createGithubBackend(g);
    const full = await state.store.getUserById(state.user.id);
    if (full) await remote.set('users', full.id, { ...full, hash: undefined, salt: undefined });
  } catch (e) {
    console.debug('[rasad] github sync failed', e.message);
  }
}

/* ------------------------------------------------------------------ */
/* کامنت‌ها                                                            */
/* ------------------------------------------------------------------ */

/**
 * ثبت رویدادهای غیر-submit بخش کامنت.
 * ارسال فرم به‌صورت سراسری در bindGlobalEvents مدیریت می‌شود تا دوبار ثبت نشود.
 */
function bindCommentActions(root, targetId) {
  root.querySelectorAll('[data-auth]').forEach((b) => {
    b.onclick = () => openAuth(b.dataset.auth);
  });
  root.querySelectorAll('[data-del-comment]').forEach((b) => {
    b.onclick = async () => {
      try {
        await state.store.deleteComment(b.dataset.delComment);
        await refreshComments(targetId);
        toast('کامنت حذف شد', 'ok');
      } catch (err) { toast(err.message, 'err'); }
    };
  });
}

async function refreshComments(targetId) {
  const comments = await state.store.listComments(targetId);
  const host = document.querySelector(`[data-comments-for="${String(targetId).replace(/"/g, '')}"]`);
  if (host) host.innerHTML = renderCommentList(comments, state.user);
  const counter = document.querySelector('#comments .sec-title small');
  if (counter) counter.textContent = `(${nf(comments.length)})`;
}

async function syncCommentsToGithub() {
  const g = await state.store.getSetting('github', {});
  if (!g?.token || !g?.owner || !g?.repo) return;
  try {
    const remote = createGithubBackend(g);
    const all = await state.store.backend.all('comments');
    const last = all.sort((a, b) => b.createdAt - a.createdAt)[0];
    if (last) await remote.set('comments', last.id, last);
  } catch (e) {
    console.debug('[rasad] comment sync failed', e.message);
  }
}

/* ------------------------------------------------------------------ */
/* دنبال کردن / لایک / ذخیره                                            */
/* ------------------------------------------------------------------ */

function bindFollow(root = document) {
  root.querySelectorAll('.btn-follow').forEach((b) => {
    b.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        const list = await state.store.toggleFollow(b.dataset.agency);
        b.classList.toggle('btn-primary', !list.includes(b.dataset.agency));
        b.classList.toggle('btn-ghost', list.includes(b.dataset.agency));
        b.textContent = list.includes(b.dataset.agency) ? 'دنبال شده ✓' : 'دنبال کردن';
        toast(list.includes(b.dataset.agency) ? 'دنبال شد' : 'لغو دنبال کردن', 'ok');
      } catch (err) {
        if (err instanceof AuthError) openAuth('login');
      }
    };
  });
}

function bindGlobalEvents() {
  document.addEventListener('click', async (e) => {
    const t = e.target;

    if (t.closest('[data-close-modal]')) return closeModal();
    if (t.id === 'overlay') return closeModal();

    const auth = t.closest('[data-auth]');
    if (auth) return openAuth(auth.dataset.auth);

    const like = t.closest('[data-like]');
    if (like) {
      try {
        const on = await state.store.toggleLike(like.dataset.like);
        like.classList.toggle('on', on);
        if (like.closest('.reel-rail')) {
          const span = like.querySelector('span');
          if (span) span.textContent = on ? '❤️' : '🤍';
        } else {
          const node = like.firstChild;
          if (node && node.nodeType === 3) node.textContent = on ? '❤️ ' : '🤍 ';
        }
      } catch (err) { if (err instanceof AuthError) openAuth('login'); }
      return;
    }

    const save = t.closest('[data-save]');
    if (save) {
      try {
        const on = await state.store.toggleSave(save.dataset.save);
        save.classList.toggle('on', on);
        save.textContent = on ? '🔖' : '📑';
        toast(on ? 'ذخیره شد' : 'از ذخیره‌ها حذف شد', 'ok');
      } catch (err) { if (err instanceof AuthError) openAuth('login'); }
      return;
    }

    const share = t.closest('[data-share]');
    if (share) {
      const url = share.dataset.share;
      if (navigator.share) { try { await navigator.share({ url, title: 'رصد' }); } catch { /* cancel */ } }
      else if (navigator.clipboard) { await navigator.clipboard.writeText(url); toast('لینک کپی شد', 'ok'); }
      return;
    }

    const storyItem = t.closest('[data-story-index]');
    if (storyItem) return openStory(+storyItem.dataset.storyIndex, 0);

    const toggleFollowing = t.closest('[data-toggle-following]');
    if (toggleFollowing) {
      state.settings.onlyFollowing = !state.settings.onlyFollowing;
      await state.store.setSetting('app', state.settings);
      return renderRoute();
    }

    if (t.closest('[data-refresh-now]')) {
      toast('در حال بروزرسانی…');
      await refreshLive();
      toast('بروزرسانی انجام شد', 'ok');
      return;
    }

    if (t.closest('[data-clear-search]')) {
      history.replaceState(null, '', '#/search');
      state.route = parseHash(location.hash);
      return renderRoute();
    }
  });

  // کامنت‌های داخل پست‌ها
  document.addEventListener('submit', async (e) => {
    const form = e.target.closest('.comment-form');
    if (!form) return;
    e.preventDefault();
    const input = form.querySelector('input[name="text"]');
    try {
      await state.store.addComment({ targetId: form.dataset.target, text: input.value });
      input.value = '';
      await refreshComments(form.dataset.target);
      await syncCommentsToGithub();
      toast('کامنت شما ثبت شد', 'ok');
    } catch (err) {
      if (err instanceof AuthError) openAuth('login');
      else toast(err.message, 'err');
    }
  });

  // ناوبری پایین و بالا
  document.querySelectorAll('.bottom-nav .nav-item').forEach((b) => {
    b.addEventListener('click', () => { location.hash = href(b.dataset.route); });
  });

  $('#btnTheme')?.addEventListener('click', async () => {
    state.settings.lightMode = !state.settings.lightMode;
    await state.store.setSetting('app', state.settings);
    applyTheme();
  });

  $('#btnAuth')?.addEventListener('click', () => {
    if (state.user) location.hash = href('me');
    else openAuth('login');
  });

  const gs = $('#globalSearch');
  if (gs) {
    gs.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && gs.value.trim()) location.hash = href('search', {}, { q: gs.value.trim() });
    });
  }

  window.addEventListener('hashchange', () => renderRoute());

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeStory(); closeModal(); }
    if (!state.story) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') nextStoryItem();
    if (e.key === ' ') { e.preventDefault(); nextStoryItem(); }
  });
}

function hydrateCurrent() {
  const name = parseHash(location.hash).name;
  if (name === 'home') hydrateHome();
  if (name === 'post') hydratePostDetail();
  if (name === 'agency') hydrateAgency();
  if (name === 'prices') hydratePrices();
  if (name === 'price') hydratePrice();
  if (name === 'search') hydrateSearch();
  if (name === 'settings') hydrateSettings();
  if (name === 'me') hydrateMe();
}

/* ------------------------------------------------------------------ */
/* boot                                                                */
/* ------------------------------------------------------------------ */

export async function boot(env = {}) {
  state.env = env;
  state.store = env.store || createStore({ sessionId: env.sessionId });
  if (env.fetchImpl) state.env.fetchImpl = env.fetchImpl;

  rebuildAgencies();
  await loadSettings();

  state.user = Store.publicUser(await state.store.currentUser());
  await loadPersisted();

  bindGlobalEvents();
  bindFollow(document);
  await refreshStories();
  renderRoute();
  updateAuthChip();

  if (state.settings.autoRefresh) {
    refreshLive({ silent: true });
    setInterval(() => refreshLive({ silent: true }), APP.REFRESH_MS);
    setInterval(() => refreshStories(), 60 * 1000);
  }
  return state;
}

export function updateAuthChip() {
  const btn = $('#btnAuth');
  if (!btn) return;
  btn.innerHTML = state.user
    ? `${avatar(state.user, { size: 28 })}`
    : '👤 ورود';
  btn.title = state.user ? (state.user.displayName || state.user.username) : 'ورود / ثبت‌نام';
}
