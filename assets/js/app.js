/**
 * هستهٔ برنامهٔ رصد: بارگذاری داده، روتینگ، رندر و رویدادها.
 *
 * اصل کار:
 *  - جمع‌آوری اخبار و قیمت‌ها فقط در GitHub Actions انجام می‌شود (هر ۳۰ دقیقه، .github/workflows/collect.yml).
 *  - مرورگر در شروع فقط یک فایل می‌خواند: data/latest.json («بستهٔ آماده») و بلافاصله همه‌چیز را نشان می‌دهد.
 *  - هیچ درخواستی به خبرگزاری‌ها یا سایت قیمت از سمت کاربر ارسال نمی‌شود، مگر خود کاربر از تنظیمات
 *    «دریافت زنده (آزمایشی)» را بزند.
 *  - در پس‌زمینه هر چند دقیقه یک بار بسته دوباره خوانده می‌شود؛ اگر اجرای جدیدی منتشر شده باشد
 *    مثل اینستاگرام پیل «پست‌های جدید» بالای فید ظاهر می‌شود.
 *
 * این ماژول در زمان import به DOM دست نمی‌زند؛ همه‌چیز داخل boot() اتفاق می‌افتد.
 */

import { APP, AGENCIES, PRICE_ENTITIES, TOPICS } from './config.js';
import { Store, createStore, AuthError, createGithubBackend } from './db.js';
import { buildStories } from './posts.js';
import { searchAll, pushRecent } from './search.js';
import {
  avatar, renderStoryRail, renderStoryViewer, renderPost, renderPostDetail, renderProfile,
  renderExplore, renderReel, renderMarket, renderPriceDetail, renderCommentList,
  renderAuthModal, renderSettings, renderSearchHome, renderSearchResults, renderSyncStatus,
  renderNav, renderTopbar, renderBrandMenu, renderSheet, renderActivity, renderInbox,
  renderArchiveDays, renderEmpty, gridCell, followButton
} from './render.js';
import { parseHash, href } from './router.js';
import {
  collectNews, collectServatmandi, snapshotsToPoints, collectCars, carsToAssets,
  loadLatestBundle, loadArchiveIndex, loadArchivedPosts, loadArchivedPrices, loadArchivedCars
} from './collect.js';
import { assetFromSeries } from './lib/bundle.js';
import { esc, nf, money, debounce, gradientFor, toFaDigits, timeAgo } from './lib/util.js';
import { formatJalali, formatJalaliLong, dateToJalali } from './lib/jalali.js';
import { icon } from './icons.js';

const DEFAULT_SETTINGS = {
  theme: 'system',            // system | dark | light
  reduceMotion: false,
  autoRefresh: true,          // فقط «بررسی دادهٔ جدید» (خواندن دوبارهٔ بسته) — نه جمع‌آوری
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
  meTab: 'saved',
  priceRange: '30d',
  priceGroup: 'all',
  story: null,
  sync: { status: 'idle', at: null, detail: '' },
  archiveIndex: null,
  bundle: null,          // بستهٔ آمادهٔ فعلی (data/latest.json)
  pendingBundle: null,   // بستهٔ تازه‌تری که در پس‌زمینه دیده شده ولی هنوز روی فید اعمال نشده
  seenActivityAt: 0,
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
  const host = document.querySelector('[data-sync-status]');
  if (host) host.innerHTML = renderSyncStatus(state.sync);
}

export function openModal(html, { title = '' } = {}) {
  const ov = $('#overlay');
  if (!ov) return;
  ov.innerHTML = `<div class="modal">${title ? `<div class="modal-head"><h3>${esc(title)}</h3></div>` : ''}
    <button class="ibtn modal-x" data-close-modal aria-label="بستن">${icon('close')}</button>
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

/** شیت پایین‌صفحه (منوی «بیشتر» پست/پروفایل) */
export function openSheet(items, opts = {}) {
  const host = $('#sheet');
  if (!host) return;
  host.innerHTML = renderSheet(items, opts);
  host.classList.add('open');
  document.body.classList.add('sheet-open');
}

export function closeSheet() {
  const host = $('#sheet');
  if (!host) return;
  host.classList.remove('open');
  host.innerHTML = '';
  document.body.classList.remove('sheet-open');
}

/* ------------------------------------------------------------------ */
/* تنظیمات و پوسته                                                      */
/* ------------------------------------------------------------------ */

async function loadSettings() {
  const saved = await state.store.getSetting('app', null);
  state.settings = { ...DEFAULT_SETTINGS, ...(saved || {}) };
  // مهاجرت از نسخهٔ قدیمی (lightMode بولی)
  if (saved && typeof saved.lightMode === 'boolean' && !saved.theme) state.settings.theme = saved.lightMode ? 'light' : 'dark';
  applyTheme();
}

export function applyTheme() {
  const t = state.settings.theme || 'system';
  let light = t === 'light';
  if (t === 'system' && typeof matchMedia === 'function') {
    try { light = matchMedia('(prefers-color-scheme: light)').matches; } catch { light = false; }
  }
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  document.documentElement.dataset.motion = state.settings.reduceMotion ? 'reduced' : 'full';
  try { localStorage.setItem('rasad_theme', t); } catch { /* حالت خصوصی */ }
}

/* ------------------------------------------------------------------ */
/* داده: بستهٔ آماده                                                    */
/* ------------------------------------------------------------------ */

function mergePosts(...lists) {
  const map = new Map();
  for (const list of lists) for (const p of list || []) if (p?.id && !map.has(p.id)) map.set(p.id, p);
  return [...map.values()].sort((a, b) => b.date - a.date);
}

/** اعمال بسته روی وضعیت برنامه (پست‌ها، دارایی‌ها، خودرو) */
export function applyBundle(bundle, { localPosts = [] } = {}) {
  if (!bundle) return;
  state.bundle = bundle;
  state.pendingBundle = null;
  state.posts = mergePosts(bundle.posts, state.posts, localPosts);
  for (const a of bundle.assets) {
    state.assets.set(a.key, a);
    // اسپارک‌لاین به‌عنوان سری اولیه؛ سری کامل هنگام باز کردن صفحهٔ قیمت از آرشیو خوانده می‌شود
    const have = state.series.get(a.key);
    if (!have?.length || have.length < (a.spark?.length || 0)) state.series.set(a.key, a.spark || []);
  }
  if (bundle.cars?.length) {
    state.cars = bundle.cars;
    const usd = state.assets.get('usd')?.last || 0;
    for (const car of carsToAssets(bundle.cars, { usdRate: usd })) state.assets.set(car.key, car);
  }
}

/**
 * بارگذاری اولیه: بستهٔ آماده (یک درخواست) + کش محلی.
 * اگر بسته هنوز منتشر نشده باشد (اولین استقرار)، از آرشیو قدیمی data/index.json استفاده می‌شود.
 */
export async function loadPersisted() {
  const fetchImpl = state.env.fetchImpl;
  const base = state.env.dataBase || APP.DATA_BASE;

  const [bundle, localPosts] = await Promise.all([
    loadLatestBundle({ base, fetchImpl }),
    state.store.allPosts()
  ]);

  if (bundle) {
    applyBundle(bundle, { localPosts });
    // کش آفلاین — بدون معطل کردن رندر
    state.store.putPostsBulk(bundle.posts).catch(() => {});
  } else {
    await loadLegacyArchive({ base, fetchImpl, localPosts });
  }
  return bundle;
}

/** مسیر جایگزین برای مخزنی که هنوز latest.json ندارد */
async function loadLegacyArchive({ base, fetchImpl, localPosts }) {
  const index = await loadArchiveIndex({ base, fetchImpl });
  state.archiveIndex = index;
  let archived = [];
  if (index?.news?.files?.length) archived = await loadArchivedPosts({ base, files: index.news.files, fetchImpl, limit: 6 });
  state.posts = mergePosts(archived, localPosts);
  if (archived.length) state.store.putPostsBulk(archived).catch(() => {});

  const keys = PRICE_ENTITIES.filter((e) => e.featured).map((e) => e.key);
  const [archivedPrices, cars] = await Promise.all([loadArchivedPrices({ base, keys, fetchImpl }), loadArchivedCars({ base, fetchImpl })]);
  for (const [key, series] of Object.entries(archivedPrices)) {
    if (!series?.length) continue;
    state.series.set(key, series);
    const ent = PRICE_ENTITIES.find((e) => e.key === key);
    const asset = assetFromSeries(ent, series);
    if (asset) state.assets.set(key, asset);
  }
  if (cars.length) {
    state.cars = cars;
    for (const car of carsToAssets(cars, { usdRate: state.assets.get('usd')?.last || 0 })) state.assets.set(car.key, car);
  }
}

/** سری کامل یک دارایی از آرشیو (فقط وقتی کاربر صفحهٔ قیمت را باز می‌کند) */
async function ensureFullSeries(key) {
  const have = state.series.get(key) || [];
  if (state.series.get(`${key}:full`)) return have;
  const base = state.env.dataBase || APP.DATA_BASE;
  const [remote, local] = await Promise.all([
    loadArchivedPrices({ base, keys: [key], fetchImpl: state.env.fetchImpl }),
    state.store.getPriceHistory(key)
  ]);
  const merged = new Map();
  for (const p of [...(remote[key] || []), ...local, ...have]) if (p && isFinite(p.t)) merged.set(p.t, p);
  const series = [...merged.values()].sort((a, b) => a.t - b.t);
  state.series.set(key, series);
  state.series.set(`${key}:full`, true);
  return series;
}

let lastCheck = 0;
/**
 * بررسی انتشار بستهٔ جدید (فقط خواندن دوبارهٔ latest.json).
 * روی فید: پیل «پست‌های جدید» تا اسکرول کاربر به‌هم نخورد. در صفحات دیگر: اعمال بی‌سروصدا.
 */
export async function checkForNewBundle({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastCheck < 30e3) return null;
  lastCheck = now;
  const bundle = await loadLatestBundle({ base: state.env.dataBase || APP.DATA_BASE, fetchImpl: state.env.fetchImpl });
  if (!bundle) return null;
  if (state.bundle && bundle.generatedAt <= state.bundle.generatedAt) return { fresh: false, bundle };

  const known = new Set(state.posts.map((p) => p.id));
  const newCount = bundle.posts.filter((p) => !known.has(p.id)).length;
  const onHome = state.route.name === 'home';
  const scrolled = typeof window !== 'undefined' && (window.scrollY || 0) > 200;

  if (onHome && newCount && scrolled) {
    state.pendingBundle = bundle;
    showNewPostsPill(newCount);
  } else {
    applyBundle(bundle);
    state.store.putPostsBulk(bundle.posts).catch(() => {});
    await refreshStories();
    if (['home', 'prices', 'price', 'activity'].includes(state.route.name)) renderRoute();
  }
  return { fresh: true, newCount, bundle };
}

function showNewPostsPill(n) {
  $('.new-posts')?.remove();
  const pill = el(`<button class="new-posts">${icon('chevronDown', { size: 14 })} ${esc(nf(n))} پست جدید</button>`);
  pill.onclick = async () => {
    pill.remove();
    if (state.pendingBundle) {
      applyBundle(state.pendingBundle);
      state.store.putPostsBulk(state.bundle.posts).catch(() => {});
      await refreshStories();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    renderRoute();
  };
  document.body.appendChild(pill);
}

/* ------------------------------------------------------------------ */
/* جمع‌آوری زنده (فقط دستی)                                             */
/* ------------------------------------------------------------------ */

/**
 * اجرای یک بار جمع‌آوری زنده در مرورگر. فقط با درخواست صریح کاربر (تنظیمات) یا از تست‌ها صدا زده می‌شود؛
 * در شروع برنامه هرگز اجرا نمی‌شود.
 */
export async function refreshLive({ silent = false } = {}) {
  if (!silent) setSync('running');
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
    for (const s of snapshots) state.assets.set(s.key, { ...s, stale: false });
    assetCount = snapshots.length;
    const points = snapshotsToPoints(snapshots);
    for (const [key, pts] of Object.entries(points)) {
      await state.store.putPricePoints(key, pts);
      state.series.set(key, await state.store.getPriceHistory(key));
      state.series.delete(`${key}:full`);
    }
    if (errors.length) console.debug('[rasad] servatmandi errors', errors.slice(0, 3));
  } catch (e) {
    console.debug('[rasad] prices failed', e.message);
  }

  try {
    const { cars } = await collectCars({ fetchImpl: state.env.fetchImpl, throttle: state.env.throttle ?? 200 });
    if (cars.length) {
      state.cars = cars;
      const usd = state.assets.get('usd')?.last || 0;
      for (const car of carsToAssets(cars, { usdRate: usd })) state.assets.set(car.key, car);
    }
  } catch { /* خودرو اختیاری است */ }

  state.posts = mergePosts(await state.store.allPosts(), state.posts);
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
/* پوسته: ناوبری و نوار بالا                                            */
/* ------------------------------------------------------------------ */

const TITLES = {
  prices: 'بازار', price: 'قیمت', search: 'جست‌وجو', archive: 'آرشیو', settings: 'تنظیمات و فعالیت',
  activity: 'اعلان‌ها', inbox: 'گفتگوها', post: 'پست', reels: 'ریلز', me: 'پروفایل', agency: ''
};

function unreadCount() {
  const since = state.seenActivityAt || 0;
  return state.posts.filter((p) => p.date > since && Date.now() - p.date < 6 * 3600e3).length > 0 ? 1 : 0;
}

/** کدام آیتم ناوبری برای هر مسیر روشن باشد (صفحات فرعی، تبِ والد را روشن نگه می‌دارند — مثل اینستاگرام) */
const NAV_FOR = { post: 'home', agency: 'home', price: 'prices', settings: 'me' };

export function renderShell() {
  const nav = $('#mainNav');
  if (nav) nav.innerHTML = renderNav(NAV_FOR[state.route.name] || state.route.name, { user: state.user, unread: unreadCount() });

  const top = $('#topbar');
  if (!top) return;
  const r = state.route;
  let title = TITLES[r.name] || '';
  let handle = '';
  if (r.name === 'agency') {
    const ag = state.agencies.find((a) => a.handle === r.params.handle || a.id === r.params.handle);
    handle = ag?.handle || r.params.handle || '';
  }
  if (r.name === 'price') {
    const a = state.assets.get(r.params.key) || PRICE_ENTITIES.find((e) => e.key === r.params.key);
    title = a?.name || 'قیمت';
  }
  if (r.name === 'archive' && r.params.day) title = `آرشیو ${dayLabel(r.params.day)}`;
  top.innerHTML = renderTopbar(r.name, { title, handle, onlyFollowing: state.settings.onlyFollowing, unread: unreadCount(), user: state.user, q: r.query.q || '' });
  top.classList.toggle('bordered', r.name !== 'home');
  top.classList.toggle('keep', !['home', 'reels'].includes(r.name));
  top.hidden = r.name === 'reels';
}

function openMoreMenu() {
  const items = [
    { label: 'تنظیمات', ico: 'settings', href: '#/settings' },
    { label: 'فعالیت شما', ico: 'clock', href: '#/activity' },
    { label: 'ذخیره‌شده‌ها', ico: 'bookmark', href: '#/me' },
    { label: 'آرشیو', ico: 'archive', href: '#/archive' },
    { label: 'تغییر پوسته', ico: document.documentElement.dataset.theme === 'light' ? 'moon' : 'sun', action: 'toggle-theme' },
    'sep',
    state.user ? { label: 'خروج از حساب', ico: 'logout', action: 'logout' } : { label: 'ورود / ثبت‌نام', ico: 'user', action: 'login' }
  ];
  openSheet(items);
}

function openPostMenu(postId) {
  const post = state.posts.find((p) => p.id === postId);
  if (!post) return;
  openSheet([
    { label: 'ذخیره', ico: 'bookmark', action: 'save', data: { id: post.id } },
    { label: 'کپی لینک خبر', ico: 'link', action: 'copy', data: { url: post.link } },
    { label: 'باز کردن در ' + post.sourceName, ico: 'external', href: post.link, external: true },
    { label: 'صفحهٔ ' + post.sourceName, ico: 'user', href: `#/u/${post.sourceHandle}` },
    'sep',
    { label: 'دربارهٔ این خبر', ico: 'info', action: 'about', data: { id: post.id } }
  ]);
}

/* ------------------------------------------------------------------ */
/* روتینگ و رندر                                                       */
/* ------------------------------------------------------------------ */

export function renderRoute() {
  state.route = parseHash(typeof location !== 'undefined' ? location.hash : '');
  const view = $('#view');
  if (!view) return;

  closeSheet();
  $('.brand-drop')?.remove();
  $('.new-posts')?.remove();
  renderShell();

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
    me: viewMe,
    activity: viewActivity,
    inbox: viewInbox
  }[state.route.name] || viewHome;

  view.className = ['prices', 'archive', 'settings', 'me', 'agency', 'search', 'activity', 'inbox'].includes(state.route.name)
    ? 'wide' : state.route.name === 'reels' ? 'full' : '';
  view.innerHTML = '';
  view.appendChild(el(html() || renderEmpty()));
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
  const st = state.stories.find((s) => s.agency.id === post.sourceId);
  return {
    liked: likedIds.includes(post.id),
    saved: savedIds.includes(post.id),
    likeCount: (likedIds.includes(post.id) ? 1 : 0) + seededLike(post),
    commentCount: comments.length,
    comments,
    following,
    user: state.user,
    hasStory: !!st,
    seenStory: st ? !st.unseen : false
  };
}

/** لایک اولیهٔ نمایشی بر اساس شناسهٔ پایدار پست (بدون سرور) */
function seededLike(post) {
  let h = 0;
  const s = String(post.id);
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
  return 3 + (h % 140);
}

/* ---------- خانه ---------- */

export function viewHome() {
  return `<div class="home-wrap" data-home-view>
    <div class="story-rail-wrap" id="storyRail">${renderStoryRail(state.stories)}</div>
    <div class="feed" data-feed><div class="loading"><div class="spinner"></div></div></div>
  </div>`;
}

export async function hydrateHome() {
  const host = $('[data-feed]');
  if (!host) return;

  const following = await state.store.followings();
  const useFollowing = state.settings.onlyFollowing && following.length;
  let posts = useFollowing ? state.posts.filter((p) => following.includes(p.sourceId)) : state.posts;
  posts = posts.slice(0, state.settings.feedSize);

  if (!state.posts.length) {
    host.innerHTML = renderEmpty({
      ico: 'cloud',
      title: 'هنوز داده‌ای منتشر نشده',
      text: `اولین اجرای جمع‌آوری خودکار (GitHub Actions) هنوز انجام نشده است. به‌محض انتشار، خبرها و قیمت‌ها بدون هیچ کاری از سمت شما اینجا ظاهر می‌شوند.`,
      action: `<button class="btn btn-secondary sm" data-refresh-bundle>${icon('refresh', { size: 16 })} بررسی دوباره</button>`
    });
    return;
  }
  if (!posts.length) {
    host.innerHTML = renderEmpty({ ico: 'user', title: 'فید دنبال‌شده‌ها خالی است', text: 'خبرگزاری‌ای را دنبال کنید یا حالت «همه» را انتخاب کنید.', action: `<button class="btn btn-primary sm" data-feed-mode="all">نمایش همه</button>` });
    return;
  }

  const parts = [];
  for (const p of posts) parts.push(renderPost(p, await postContext(p)));
  host.innerHTML = parts.join('');
  bindFollow(host);
  bindCaptions(host);
}

function bindCaptions(root) {
  root.querySelectorAll('[data-more]').forEach((b) => {
    b.onclick = (e) => { e.preventDefault(); b.closest('.caption')?.classList.remove('clamped'); b.remove(); };
  });
}

/* ---------- پست ---------- */

export function viewPost(id) {
  const post = state.posts.find((p) => p.id === id);
  return `<div class="detail-wrap" data-post-detail="${esc(id)}">
    ${post ? '<div class="loading"><div class="spinner"></div></div>' : renderEmpty({ ico: 'info', title: 'پست پیدا نشد', action: '<a class="btn btn-secondary sm" href="#/">بازگشت به خانه</a>' })}
  </div>`;
}

export async function hydratePostDetail() {
  const wrap = $('[data-post-detail]');
  if (!wrap) return;
  const id = wrap.dataset.postDetail;
  const post = state.posts.find((p) => p.id === id) || await state.store.getPost(id);
  if (!post) return;
  const ctx = await postContext(post);
  wrap.innerHTML = renderPostDetail(post, ctx);
  bindFollow(wrap);
  bindCommentActions(wrap, post.id);
  if (location.hash.endsWith('#comments')) wrap.querySelector('#comments')?.scrollIntoView({ block: 'start' });
}

/* ---------- خبرگزاری (پروفایل) ---------- */

export function viewAgency(handle) {
  const agency = state.agencies.find((a) => a.handle === handle || a.id === handle);
  if (!agency) return `<div class="page-wrap">${renderEmpty({ ico: 'user', title: 'صفحهٔ این خبرگزاری پیدا نشد', action: '<a class="btn btn-secondary sm" href="#/">بازگشت</a>' })}</div>`;
  return `<div class="page-wrap" data-agency-view="${esc(agency.id)}"><div class="loading"><div class="spinner"></div></div></div>`;
}

export async function hydrateAgency() {
  const host = $('[data-agency-view]');
  if (!host) return;
  const id = host.dataset.agencyView;
  const agency = state.agencies.find((a) => a.id === id || a.handle === id);
  if (!agency) return;

  const posts = state.posts.filter((p) => p.sourceId === agency.id).slice(0, 120);
  const [following, seen] = await Promise.all([state.store.isFollowing(agency.id), state.store.seenStoryKeys()]);
  const stories = buildStories(posts, { agencies: [agency], seen });
  const followers = await followerCount(agency.id);

  host.innerHTML = renderProfile(agency, {
    posts,
    following,
    tab: state.profileTab,
    storyCount: stories[0]?.count || 0,
    unseen: !!stories[0]?.unseen,
    followers,
    counts: { posts: posts.length, stories: stories[0]?.count || 0 }
  });

  host.querySelectorAll('[data-ptab]').forEach((b) => {
    b.onclick = () => { state.profileTab = b.dataset.ptab; hydrateAgency(); };
  });
  // کلیک روی آواتار پروفایل → استوری همان خبرگزاری
  const av = host.querySelector('.profile-top .avatar');
  if (av && stories[0]) {
    av.style.cursor = 'pointer';
    av.onclick = () => {
      const idx = state.stories.findIndex((s) => s.agency.id === agency.id);
      if (idx >= 0) openStory(idx, 0);
    };
  }
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

/* ---------- بازار ---------- */

export function viewPrices() {
  return `<div class="narrow-wrap" data-prices-view><div class="loading"><div class="spinner"></div></div></div>`;
}

export async function hydratePrices() {
  const host = $('[data-prices-view]');
  if (!host) return;
  const missing = PRICE_ENTITIES.filter((e) => !state.assets.has(e.key)).length;
  host.innerHTML = renderMarket({
    assets: [...state.assets.values()],
    group: state.priceGroup,
    bundle: state.bundle,
    missing,
    series: state.series
  });
  host.querySelectorAll('[data-pgroup]').forEach((b) => {
    b.onclick = () => { state.priceGroup = b.dataset.pgroup; hydratePrices(); };
  });
}

export function viewPrice(key) {
  return `<div class="narrow-wrap" data-price-view="${esc(key)}" data-range="${esc(state.priceRange)}"><div class="loading"><div class="spinner"></div></div></div>`;
}

export async function hydratePrice() {
  const host = $('[data-price-view]');
  if (!host) return;
  const key = host.dataset.priceView;
  state.priceRange = host.dataset.range || state.priceRange;

  const series = await ensureFullSeries(key);
  let asset = state.assets.get(key);
  if (!asset) {
    const ent = PRICE_ENTITIES.find((e) => e.key === key);
    asset = assetFromSeries(ent, series);
    if (asset) state.assets.set(key, asset);
  }
  if (!asset) {
    host.innerHTML = renderEmpty({ ico: 'market', title: 'این دارایی شناخته نشده است', action: '<a class="btn btn-secondary sm" href="#/prices">بازگشت به بازار</a>' });
    return;
  }
  if (!$('[data-price-view]')) return; // کاربر صفحه را عوض کرده

  const targetId = `price:${key}`;
  const comments = await state.store.listComments(targetId);
  host.innerHTML = renderPriceDetail(asset, series, {
    rangeId: state.priceRange,
    comments,
    user: state.user,
    commentCount: comments.length
  });
  renderShell();

  host.querySelectorAll('[data-range]').forEach((b) => {
    b.onclick = () => { state.priceRange = b.dataset.range; host.dataset.range = b.dataset.range; hydratePrice(); };
  });
  initChartTips(host);
  bindCommentActions(host, targetId);
}

/** tooltip نمودار: «در فلان زمان این قیمت بوده» */
export function initChartTips(root = document) {
  root.querySelectorAll('.chart-wrap').forEach((wrap) => {
    const tip = wrap.querySelector('.chart-tip');
    if (!tip) return;
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

/* ---------- جست‌وجو ---------- */

export function viewSearch() {
  const q = state.route.query.q || '';
  return `<div class="search-page narrow-wrap"><div id="searchBody">${q ? '<div class="loading"><div class="spinner"></div></div>' : ''}</div></div>`;
}

export async function hydrateSearch() {
  const body = $('#searchBody');
  const input = $('#searchInput');
  if (!body) return;
  const q = state.route.query.q || '';

  if (input) {
    if (!q) input.focus?.();
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
      `<div class="row-head">اکسپلور</div>` +
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

/* ---------- ریلز ---------- */

function reelList() {
  return state.posts.filter((p) => p.img || p.title).slice(0, 40);
}

export function viewReels() {
  const reels = reelList();
  if (!reels.length) return `<div class="page-wrap">${renderEmpty({ ico: 'reels', title: 'ریلز هنوز خالی است', text: 'پس از اولین انتشار داده پر می‌شود.' })}</div>`;
  return `<div class="reels-stage" data-reels>
    <div class="reels-title"><b>ریلز</b>${icon('camera')}</div>
    ${reels.map((p, i) => renderReel(p, { index: i, total: reels.length })).join('')}
  </div>`;
}

export function initReels() {
  const stage = $('[data-reels]');
  if (!stage) return;
  const reels = reelList();
  stage.querySelector('.reel')?.classList.add('current');
  hydrateReelMeta(stage, reels);
  stage.addEventListener('scroll', () => {
    const i = Math.round(stage.scrollTop / (stage.clientHeight || 1));
    stage.querySelectorAll('.reel').forEach((r, k) => r.classList.toggle('current', k === i));
  }, { passive: true });
  bindFollow(stage);
}

async function hydrateReelMeta(stage, reels) {
  const [liked, following] = await Promise.all([state.store.likedIds(), state.store.followings()]);
  stage.querySelectorAll('.reel').forEach(async (node, i) => {
    const post = reels[i];
    if (!post) return;
    const n = await state.store.countComments(post.id);
    const likeBtn = node.querySelector('[data-like]');
    if (likeBtn) {
      const on = liked.includes(post.id);
      likeBtn.classList.toggle('on', on);
      likeBtn.querySelector('.ico')?.replaceWith(el(icon('heart', { active: on })));
      likeBtn.querySelector('small').textContent = nf(seededLike(post) + (on ? 1 : 0));
    }
    const cmt = node.querySelector('.rail-btn[href]');
    if (cmt) cmt.querySelector('small').textContent = nf(n);
    if (following.includes(post.sourceId)) node.querySelector('.follow-pill')?.remove();
  });
}

/* ---------- آرشیو ---------- */

function dayKey(ts) {
  const j = dateToJalali(new Date(ts));
  return `${j.jy}-${String(j.jm).padStart(2, '0')}-${String(j.jd).padStart(2, '0')}`;
}
function dayLabel(key) {
  const [jy, jm, jd] = key.split('-').map(Number);
  if (!jy || !jm || !jd) return key;
  const first = state.posts.find((p) => dayKey(p.date) === key);
  return first ? formatJalaliLong(first.date) : `${toFaDigits(jd)}/${toFaDigits(jm)}/${toFaDigits(jy)}`;
}

export function viewArchive() {
  const day = state.route.params.day;
  if (day) {
    const posts = state.posts.filter((p) => dayKey(p.date) === day);
    return `<div class="page-wrap archive-day-page">
      <div class="note">${esc(nf(posts.length))} خبر در ${esc(dayLabel(day))} — با ساعت دقیق انتشار</div>
      ${posts.length ? `<div class="profile-grid">${posts.map((p) => gridCell(p, { meta: p.exactDateShort?.split(' ').pop() || '' })).join('')}</div>` : renderEmpty({ ico: 'archive', title: 'خبری برای این روز نیست' })}
    </div>`;
  }
  const days = new Map();
  for (const p of state.posts) {
    const k = dayKey(p.date);
    if (!days.has(k)) days.set(k, { key: k, label: formatJalaliLong(p.date), count: 0 });
    days.get(k).count++;
  }
  const rows = [...days.values()].sort((a, b) => b.key.localeCompare(a.key)).slice(0, 90);
  return `<div class="narrow-wrap archive-page">${renderArchiveDays(rows, { retentionDays: state.settings.newsDays })}</div>`;
}

/* ---------- اعلان‌ها و گفتگوها ---------- */

export function viewActivity() {
  return `<div class="narrow-wrap" data-activity-view><div class="loading"><div class="spinner"></div></div></div>`;
}

export async function hydrateActivity() {
  const host = $('[data-activity-view]');
  if (!host) return;
  const following = await state.store.followings();
  const items = [];
  const src = following.length ? state.posts.filter((p) => following.includes(p.sourceId)) : state.posts;
  for (const p of src.slice(0, 25)) items.push({ type: 'post', post: p, at: p.date });
  for (const a of state.assets.values()) {
    if (Math.abs(a.changePct || 0) >= 1 && a.time) items.push({ type: 'price', asset: a, at: a.time });
  }
  if (state.bundle?.generatedAt) {
    items.push({ type: 'system', text: `بستهٔ خبری جدید منتشر شد: ${nf(state.bundle.counts?.posts || 0)} پست و ${nf(state.bundle.counts?.assets || 0)} قیمت (اجرای خودکار GitHub Actions)`, at: state.bundle.generatedAt });
  }
  items.sort((a, b) => b.at - a.at);
  host.innerHTML = renderActivity(items.slice(0, 60));
  state.seenActivityAt = Date.now();
  state.store.setSetting('seenActivityAt', state.seenActivityAt).catch?.(() => {});
  renderShell();
}

export function viewInbox() {
  return `<div class="narrow-wrap" data-inbox-view><div class="loading"><div class="spinner"></div></div></div>`;
}

export async function hydrateInbox() {
  const host = $('[data-inbox-view]');
  if (!host) return;
  if (!state.user) { host.innerHTML = renderInbox([], null); return; }
  const all = (await state.store.backend.all('comments')).filter((c) => c.userId === state.user.id);
  const threads = new Map();
  for (const c of all.sort((a, b) => b.createdAt - a.createdAt)) {
    if (!threads.has(c.targetId)) {
      let title = c.targetId, href = '#/', img = '', ico = '💬';
      if (String(c.targetId).startsWith('price:')) {
        const key = c.targetId.slice(6);
        const a = state.assets.get(key) || PRICE_ENTITIES.find((e) => e.key === key);
        title = a?.name || key; href = `#/price/${key}`; ico = a?.icon || '💹';
      } else {
        const p = state.posts.find((x) => x.id === c.targetId);
        title = p?.title || 'پست'; href = `#/p/${c.targetId}`; img = p?.img || '';
      }
      threads.set(c.targetId, { title, href, img, icon: ico, last: c.text.slice(0, 60), at: c.createdAt, count: 0 });
    }
    threads.get(c.targetId).count++;
  }
  host.innerHTML = renderInbox([...threads.values()], state.user);
}

/* ---------- تنظیمات ---------- */

export function viewSettings() {
  return `<div class="narrow-wrap" data-settings-view><div class="loading"><div class="spinner"></div></div></div>`;
}

export async function hydrateSettings() {
  const host = $('[data-settings-view]');
  if (!host) return;
  const stats = await state.store.stats();
  const github = (await state.store.getSetting('github', {})) || {};
  host.innerHTML = renderSettings({
    settings: state.settings,
    stats,
    github,
    user: state.user,
    bundle: state.bundle,
    backendId: state.store.backend.id
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
  host.querySelectorAll('[data-theme-seg] [data-theme]').forEach((b) => {
    b.onclick = async () => {
      state.settings.theme = b.dataset.theme;
      await state.store.setSetting('app', state.settings);
      applyTheme();
      host.querySelectorAll('[data-theme-seg] button').forEach((x) => x.classList.toggle('active', x === b));
    };
  });
  const feed = host.querySelector('[data-setting-num="feedSize"]');
  if (feed) feed.onchange = () => {
    state.settings.feedSize = Math.max(10, Math.min(120, +feed.value || 30));
    state.store.setSetting('app', state.settings);
  };

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
    if (!confirm('همهٔ دادهٔ محلی (حساب‌ها، نظرها، کش) پاک شود؟')) return;
    for (const s of ['posts', 'prices', 'comments', 'users', 'likes', 'saves', 'follows', 'seen', 'settings']) {
      await state.store.backend.clear(s);
    }
    state.posts = [];
    state.assets.clear();
    state.series.clear();
    state.user = null;
    toast('دادهٔ محلی پاک شد', 'warn');
    await loadPersisted();
    await refreshStories();
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

/* ---------- پروفایل کاربر ---------- */

export function viewMe() {
  if (!state.user) {
    return `<div class="page-wrap">${renderEmpty({
      ico: 'user',
      title: 'وارد نشده‌اید',
      text: 'برای نظر گذاشتن، پسندیدن، ذخیره کردن و دنبال کردن خبرگزاری‌ها یک حساب کاربری بسازید.',
      action: `<div class="row-btns" style="justify-content:center"><button class="btn btn-primary" data-auth="login">ورود</button><button class="btn btn-secondary" data-auth="register">ثبت‌نام</button></div>`
    })}</div>`;
  }
  return `<div class="page-wrap" data-me-view><div class="loading"><div class="spinner"></div></div></div>`;
}

export async function hydrateMe() {
  const host = $('[data-me-view]');
  if (!host || !state.user) return;
  const [followings, savedIds, likedIds, stats] = await Promise.all([
    state.store.followings(), state.store.savedIds(), state.store.likedIds(), state.store.stats()
  ]);
  const savedPosts = state.posts.filter((p) => savedIds.includes(p.id));
  const likedPosts = state.posts.filter((p) => likedIds.includes(p.id));
  const tab = state.meTab;
  const list = tab === 'liked' ? likedPosts : savedPosts;

  host.innerHTML = `<section class="profile">
    <div class="profile-top">
      ${avatar(state.user, { size: 86 })}
      <div class="profile-stats">
        <div><b>${esc(nf(stats.comments || 0))}</b><span>نظر</span></div>
        <div><b>${esc(nf(followings.length))}</b><span>دنبال‌شده</span></div>
        <div><b>${esc(nf(savedPosts.length))}</b><span>ذخیره</span></div>
      </div>
    </div>
    <div class="profile-bio">
      <h1>${esc(state.user.displayName || state.user.username)}</h1>
      <div class="cat handle" dir="ltr">@${esc(state.user.username)}</div>
      <p>عضو رصد از ${esc(formatJalali(state.user.createdAt || Date.now(), { withTime: false }))}</p>
    </div>
    <div class="profile-btns">
      <a class="btn btn-secondary" href="#/settings">ویرایش پروفایل</a>
      <a class="btn btn-secondary" href="#/inbox">گفتگوها</a>
      <button class="btn btn-secondary sq" data-logout aria-label="خروج">${icon('logout', { size: 18 })}</button>
    </div>
    ${followings.length ? `<div class="story-rail-wrap"><div class="story-rail">${followings.map((id) => {
      const a = state.agencies.find((x) => x.id === id);
      return a ? `<a class="story-item" href="#/u/${esc(a.handle)}">${avatar(a, { size: 66 })}<span class="story-name">${esc(a.name)}</span></a>` : '';
    }).join('')}</div></div>` : `<div class="note">هنوز خبرگزاری‌ای را دنبال نمی‌کنید.</div>`}
    <nav class="profile-tabs" role="tablist">
      <button role="tab" class="tab ${tab === 'saved' ? 'active' : ''}" data-metab="saved" aria-label="ذخیره‌شده‌ها">${icon('bookmark')}</button>
      <button role="tab" class="tab ${tab === 'liked' ? 'active' : ''}" data-metab="liked" aria-label="پسندیده‌ها">${icon('heart')}</button>
    </nav>
    ${list.length ? `<div class="profile-grid">${list.map((p) => gridCell(p)).join('')}</div>`
      : renderEmpty({ ico: tab === 'saved' ? 'bookmark' : 'heart', title: tab === 'saved' ? 'ذخیره کنید' : 'پسند کنید', text: tab === 'saved' ? 'خبرهایی که ذخیره می‌کنید فقط برای خودتان اینجا نمایش داده می‌شود.' : 'خبرهایی که پسند می‌کنید اینجا جمع می‌شود.' })}
  </section>`;

  host.querySelectorAll('[data-metab]').forEach((b) => { b.onclick = () => { state.meTab = b.dataset.metab; hydrateMe(); }; });
  host.querySelector('[data-logout]')?.addEventListener('click', logout);
}

async function logout() {
  await state.store.logout();
  state.user = null;
  toast('از حساب خارج شدید');
  renderRoute();
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
  const wasOpen = !!state.story;
  state.story = null;
  stopStoryTimer();
  if (wasOpen) refreshStories();
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
  // لمس طولانی = مکث (مثل اینستاگرام)
  ov.querySelectorAll('.story-tap').forEach((b) => {
    b.addEventListener('pointerdown', stopStoryTimer);
    b.addEventListener('pointerup', startStoryTimer);
  });
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

function bindCommentActions(root, targetId) {
  root.querySelectorAll('[data-del-comment]').forEach((b) => {
    b.onclick = async () => {
      try {
        await state.store.deleteComment(b.dataset.delComment);
        await refreshComments(targetId);
        toast('نظر حذف شد', 'ok');
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
  bindCommentActions(document, targetId);
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
        const on = list.includes(b.dataset.agency);
        if (b.dataset.variant === 'button') {
          b.outerHTML = followButton(on, b.dataset.agency);
          bindFollow(root);
        } else if (b.dataset.variant === 'pill') {
          b.remove();
        } else {
          b.textContent = on ? 'دنبال می‌کنید' : 'دنبال کردن';
          b.classList.toggle('muted', on);
        }
        toast(on ? 'دنبال شد' : 'لغو دنبال کردن', 'ok');
      } catch (err) {
        if (err instanceof AuthError) openAuth('login');
      }
    };
  });
}

const cssEsc = (v) => (globalThis.CSS?.escape ? CSS.escape(String(v)) : String(v).replace(/["\\]/g, '\\$&'));

function swapIcon(btn, name, on) {
  const old = btn.querySelector('.ico');
  const fresh = el(icon(name, { active: on }));
  if (old) old.replaceWith(fresh); else btn.prepend(fresh);
}

async function toggleLike(id, btn) {
  try {
    const on = await state.store.toggleLike(id);
    document.querySelectorAll(`[data-like="${cssEsc(id)}"]`).forEach((b) => {
      b.classList.toggle('on', on);
      swapIcon(b, 'heart', on);
    });
    const likes = btn?.closest('.post')?.querySelector('.likes');
    if (likes) {
      const post = state.posts.find((p) => p.id === id);
      if (post) likes.textContent = `${nf(seededLike(post) + (on ? 1 : 0))} پسند`;
    }
    return on;
  } catch (err) {
    if (err instanceof AuthError) openAuth('login');
    return null;
  }
}

async function toggleSave(id) {
  try {
    const on = await state.store.toggleSave(id);
    document.querySelectorAll(`[data-save="${cssEsc(id)}"]`).forEach((b) => {
      b.classList.toggle('on', on);
      swapIcon(b, 'bookmark', on);
    });
    toast(on ? 'ذخیره شد' : 'از ذخیره‌ها حذف شد', 'ok');
    return on;
  } catch (err) {
    if (err instanceof AuthError) openAuth('login');
    return null;
  }
}

async function shareUrl(url) {
  if (navigator.share) { try { await navigator.share({ url, title: 'رصد' }); return; } catch { /* cancel */ } }
  if (navigator.clipboard) { await navigator.clipboard.writeText(url); toast('لینک کپی شد', 'ok'); }
}

function bindGlobalEvents() {
  document.addEventListener('click', async (e) => {
    const t = e.target;
    if (!t || typeof t.closest !== 'function') return;

    if (t.closest('[data-close-modal]')) return closeModal();
    if (t.id === 'overlay') return closeModal();
    if (t.id === 'sheet') return closeSheet();
    if (t.closest('[data-close-sheet]')) return closeSheet();

    const sheetAction = t.closest('[data-sheet-action]');
    if (sheetAction) {
      const a = sheetAction.dataset.sheetAction;
      closeSheet();
      if (a === 'toggle-theme') {
        state.settings.theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
        await state.store.setSetting('app', state.settings);
        applyTheme();
      } else if (a === 'logout') await logout();
      else if (a === 'login') openAuth('login');
      else if (a === 'save') await toggleSave(sheetAction.dataset.id);
      else if (a === 'copy') await shareUrl(sheetAction.dataset.url);
      else if (a === 'about') {
        const p = state.posts.find((x) => x.id === sheetAction.dataset.id);
        if (p) openModal(`<div class="page-pad"><p><b>${esc(p.sourceFull)}</b></p><p class="small muted">انتشار: ${esc(formatJalaliLong(p.date))} · ${esc(p.exactDate)}</p><p class="small muted">بایگانی: ${esc(formatJalali(p.collectedAt || p.date))}</p><p class="small muted">موضوع: ${esc(p.topic)}</p><p class="small"><a class="link" href="${esc(p.link)}" target="_blank" rel="noopener">${esc(p.link)}</a></p></div>`, { title: 'دربارهٔ این خبر' });
      }
      return;
    }

    if (t.closest('[data-open-menu]')) return openMoreMenu();
    if (t.closest('[data-back]')) {
      if (history.length > 1) history.back(); else location.hash = '#/';
      return;
    }

    const brand = t.closest('[data-brand-menu]');
    if (brand) {
      const existing = $('.brand-drop');
      if (existing) { existing.remove(); return; }
      $('#topbar')?.appendChild(el(renderBrandMenu({ onlyFollowing: state.settings.onlyFollowing, bundle: state.bundle })));
      return;
    }
    const feedMode = t.closest('[data-feed-mode]');
    if (feedMode) {
      $('.brand-drop')?.remove();
      state.settings.onlyFollowing = feedMode.dataset.feedMode === 'following';
      await state.store.setSetting('app', state.settings);
      return renderRoute();
    }
    if (!t.closest('.brand-drop')) $('.brand-drop')?.remove();

    const postMenu = t.closest('[data-post-menu]');
    if (postMenu) { e.preventDefault(); return openPostMenu(postMenu.dataset.postMenu); }
    const agencyMenu = t.closest('[data-agency-menu]');
    if (agencyMenu) {
      const ag = state.agencies.find((a) => a.handle === agencyMenu.dataset.agencyMenu);
      if (ag) openSheet([
        { label: 'باز کردن سایت', ico: 'external', href: ag.site, external: true },
        { label: 'کپی لینک', ico: 'link', action: 'copy', data: { url: ag.site } },
        { label: 'فید RSS', ico: 'rss', href: ag.feeds?.[0] || ag.site, external: true }
      ]);
      return;
    }

    const auth = t.closest('[data-auth]');
    if (auth) return openAuth(auth.dataset.auth);

    const like = t.closest('[data-like]');
    if (like) { e.preventDefault(); return toggleLike(like.dataset.like, like); }

    const save = t.closest('[data-save]');
    if (save) { e.preventDefault(); return toggleSave(save.dataset.save); }

    const share = t.closest('[data-share]');
    if (share) { e.preventDefault(); return shareUrl(share.dataset.share); }

    const storyItem = t.closest('[data-story-index]');
    if (storyItem) return openStory(+storyItem.dataset.storyIndex, 0);

    if (t.closest('[data-refresh-bundle]')) {
      toast('در حال بررسی دادهٔ جدید…');
      const r = await checkForNewBundle({ force: true });
      if (!r) toast('بستهٔ آماده هنوز منتشر نشده است', 'err');
      else toast(r.fresh ? `بستهٔ جدید اعمال شد (${nf(r.newCount || 0)} پست تازه)` : 'داده تازه است', 'ok');
      if (state.route.name === 'settings') hydrateSettings();
      return;
    }

    if (t.closest('[data-refresh-now]')) {
      toast('دریافت زنده آغاز شد…');
      const r = await refreshLive();
      toast(`${nf(r.newsCount)} خبر و ${nf(r.assetCount)} قیمت دریافت شد`, 'ok');
      return;
    }

    if (t.closest('[data-clear-search]')) {
      history.replaceState(null, '', '#/search');
      state.route = parseHash(location.hash);
      return renderRoute();
    }
  });

  // دابل‌کلیک روی رسانهٔ پست = لایک (مثل اینستاگرام)
  document.addEventListener('dblclick', async (e) => {
    const media = typeof e.target?.closest === 'function' ? e.target.closest('[data-media]') : null;
    if (!media) return;
    e.preventDefault();
    const id = media.dataset.media;
    const liked = await state.store.likedIds().catch(() => []);
    media.classList.remove('liked-anim');
    void media.offsetWidth;
    media.classList.add('liked-anim');
    if (!liked.includes(id)) toggleLike(id, media);
  });
  // جلوگیری از باز شدن پست با دابل‌کلیک
  document.addEventListener('click', (e) => {
    const media = typeof e.target?.closest === 'function' ? e.target.closest('[data-media]') : null;
    if (media && e.detail > 1) e.preventDefault();
  }, true);

  // ارسال نظر (فرم داخل پست/صفحهٔ قیمت)
  document.addEventListener('submit', async (e) => {
    const form = e.target.closest('.comment-form');
    if (!form) return;
    e.preventDefault();
    const input = form.querySelector('input[name="text"]');
    try {
      await state.store.addComment({ targetId: form.dataset.target, text: input.value });
      input.value = '';
      form.classList.remove('has-text');
      await refreshComments(form.dataset.target);
      await syncCommentsToGithub();
      toast('نظر شما ثبت شد', 'ok');
    } catch (err) {
      if (err instanceof AuthError) openAuth('login');
      else toast(err.message, 'err');
    }
  });
  document.addEventListener('input', (e) => {
    const form = typeof e.target?.closest === 'function' ? e.target.closest('.add-comment') : null;
    if (form) form.classList.toggle('has-text', !!e.target.value.trim());
  });

  window.addEventListener('hashchange', () => renderRoute());

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeStory(); closeModal(); closeSheet(); $('.brand-drop')?.remove(); }
    if (!state.story) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') nextStoryItem();
    if (e.key === ' ') { e.preventDefault(); nextStoryItem(); }
  });

  // بازگشت به تب → فقط بررسی انتشار بستهٔ جدید
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.settings.autoRefresh) checkForNewBundle().catch(() => {});
  });
  try {
    matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (state.settings.theme === 'system') applyTheme(); });
  } catch { /* jsdom */ }
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
  if (name === 'activity') hydrateActivity();
  if (name === 'inbox') hydrateInbox();
}

/* ------------------------------------------------------------------ */
/* boot                                                                */
/* ------------------------------------------------------------------ */

let boundDocument = null;

export async function boot(env = {}) {
  state.env = env;
  state.store = env.store || createStore({ sessionId: env.sessionId });
  if (env.fetchImpl) state.env.fetchImpl = env.fetchImpl;

  // وضعیت گذرا از صفر (boot ممکن است در تست‌ها چند بار صدا زده شود)
  Object.assign(state, { posts: [], assets: new Map(), series: new Map(), cars: [], stories: [], bundle: null, pendingBundle: null, story: null, user: null });
  lastCheck = 0;

  rebuildAgencies();
  await loadSettings();
  state.seenActivityAt = (await state.store.getSetting('seenActivityAt', 0)) || 0;
  state.user = Store.publicUser(await state.store.currentUser());

  if (boundDocument !== document) { bindGlobalEvents(); boundDocument = document; }
  renderShell();

  // فقط خواندن دادهٔ آمادهٔ منتشرشده — هیچ جمع‌آوری‌ای در مرورگر
  await loadPersisted();
  await refreshStories();
  renderRoute();

  if (state.settings.autoRefresh && !env.noTimers) {
    setInterval(() => checkForNewBundle().catch(() => {}), APP.REFRESH_MS);
    setInterval(() => refreshStories(), 60 * 1000);
  }
  return state;
}

/** سازگاری با نسخهٔ قبلی (چیپ ورود در هدر حذف شده و به ناوبری منتقل شده) */
export function updateAuthChip() { renderShell(); }

export { timeAgo };
