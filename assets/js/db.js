/**
 * لایهٔ دادهٔ رصد.
 *
 * GitHub Pages یک میزبان استاتیک است و دیتابیس ندارد؛ بنابراین سه لایه داریم:
 *  1) IndexedDB مرورگر        → ذخیرهٔ دائمی روی دستگاه کاربر (با رفرش پاک نمی‌شود)
 *  2) فایل‌های JSON مخزن گیت   → آرشیو مشترک که GitHub Actions هر ۳۰ دقیقه می‌سازد
 *  3) GitHub Contents API     → همگام‌سازی اختیاری حساب‌ها/دنبال‌شونده‌ها/کامنت‌ها روی ریپو
 *
 * همهٔ توابع این ماژول async هستند و به DOM دست نمی‌زنند (قابل تست در Node).
 */

import { hashPassword, randomSalt, uid } from './lib/util.js';
import { APP } from './config.js';

export class AuthError extends Error {
  constructor(message = 'برای این کار باید وارد حساب کاربری شوید') {
    super(message);
    this.name = 'AuthError';
    this.code = 'AUTH_REQUIRED';
  }
}

const sep = '\u0001';
const k = (name, key) => `${name}${sep}${key}`;

/* ------------------------------------------------------------------ */
/* Backends                                                            */
/* ------------------------------------------------------------------ */

/** حافظهٔ RAM - برای تست و حالت بدون ذخیره‌سازی */
export function createMemoryBackend(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    id: 'memory',
    async get(name, key) { return map.has(k(name, key)) ? JSON.parse(map.get(k(name, key))) : undefined; },
    async set(name, key, value) { map.set(k(name, key), JSON.stringify(value)); },
    async del(name, key) { map.delete(k(name, key)); },
    async all(name) {
      const prefix = name + sep;
      const out = [];
      for (const [kk, v] of map) if (kk.startsWith(prefix)) out.push(JSON.parse(v));
      return out;
    },
    async clear(name) {
      const prefix = name + sep;
      for (const kk of [...map.keys()]) if (kk.startsWith(prefix)) map.delete(kk);
    }
  };
}

/** localStorage - پشتیبان وقتی IndexedDB در دسترس نیست */
export function createLocalStorageBackend(storage, ns = 'rasad_db') {
  const readAll = () => {
    try { return JSON.parse(storage.getItem(ns) || '{}'); } catch { return {}; }
  };
  const writeAll = (obj) => storage.setItem(ns, JSON.stringify(obj));
  return {
    id: 'localstorage',
    async get(name, key) { return readAll()[k(name, key)]; },
    async set(name, key, value) { const o = readAll(); o[k(name, key)] = value; writeAll(o); },
    async del(name, key) { const o = readAll(); delete o[k(name, key)]; writeAll(o); },
    async all(name) {
      const prefix = name + sep;
      return Object.entries(readAll()).filter(([kk]) => kk.startsWith(prefix)).map(([, v]) => v);
    },
    async clear(name) {
      const prefix = name + sep;
      const o = readAll();
      for (const kk of Object.keys(o)) if (kk.startsWith(prefix)) delete o[kk];
      writeAll(o);
    }
  };
}

/** IndexedDB - ذخیرهٔ دائمی اصلی در مرورگر */
export function createIndexedDBBackend(dbName = 'rasad', version = 1) {
  let dbp = null;
  const open = () => {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, version);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  };
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction('kv', mode);
      const store = t.objectStore('kv');
      let out;
      const done = () => resolve(out);
      t.oncomplete = done;
      t.onabort = () => reject(t.error);
      t.onerror = () => reject(t.error);
      out = fn(store);
    });
  };
  const wrap = (req) => new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return {
    id: 'indexeddb',
    async get(name, key) { return tx('readonly', (s) => wrap(s.get(k(name, key)))); },
    async set(name, key, value) { await tx('readwrite', (s) => wrap(s.put(value, k(name, key)))); },
    async del(name, key) { await tx('readwrite', (s) => wrap(s.delete(k(name, key)))); },
    async all(name) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const t = db.transaction('kv', 'readonly');
        const store = t.objectStore('kv');
        const range = IDBKeyRange.bound(name + sep, name + sep + '\uffff');
        const req = store.getAll(range);
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    },
    async clear(name) {
      const db = await open();
      await new Promise((resolve, reject) => {
        const t = db.transaction('kv', 'readwrite');
        const store = t.objectStore('kv');
        const range = IDBKeyRange.bound(name + sep, name + sep + '\uffff');
        const req = store.delete(range);
        req.onsuccess = resolve;
        req.onerror = () => reject(req.error);
      });
    }
  };
}

/**
 * همگام‌سازی روی خود مخزن گیت‌هاب (Contents API).
 * هر رکورد = یک فایل JSON کوچک زیر `dir/name/key.json`.
 * این یعنی داده روی GitHub «ذخیره» می‌شود و با پاک شدن کش مرورگر از بین نمی‌رود.
 */
export function createGithubBackend({ token, owner, repo, branch = 'main', dir = 'user-data', api = 'https://api.github.com', fetchImpl } = {}) {
  const f = fetchImpl || globalThis.fetch;
  if (!token || !owner || !repo) throw new Error('پیکربندی همگام‌سازی گیت‌هاب ناقص است (token/owner/repo)');

  const path = (name, key) => `${dir}/${name}/${encodeURIComponent(key)}.json`;
  const auth = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json'
  };

  async function putJson(p, value) {
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(value, null, 2))));
    // sha فعلی برای بروزرسانی
    let sha;
    const head = await f(`${api}/repos/${owner}/${repo}/contents/${p}?ref=${branch}`, { headers: auth });
    if (head.ok) sha = (await head.json()).sha;
    const res = await f(`${api}/repos/${owner}/${repo}/contents/${p}`, {
      method: 'PUT',
      headers: auth,
      body: JSON.stringify({
        message: `chore(data): sync ${p}`,
        content,
        branch,
        ...(sha ? { sha } : {})
      })
    });
    if (!res.ok) throw new Error(`GitHub PUT failed (${res.status}) for ${p}`);
    return res.json();
  }

  async function listKeys(name) {
    const res = await f(`${api}/repos/${owner}/${repo}/contents/${dir}/${name}?ref=${branch}`, { headers: auth });
    if (!res.ok) return [];
    const items = await res.json();
    return Array.isArray(items) ? items.filter((i) => i.name.endsWith('.json')).map((i) => decodeURIComponent(i.name.replace(/\.json$/, ''))) : [];
  }

  return {
    id: 'github',
    async get(name, key) {
      const res = await f(`${api}/repos/${owner}/${repo}/contents/${path(name, key)}?ref=${branch}`, { headers: auth });
      if (!res.ok) return undefined;
      const j = await res.json();
      try { return JSON.parse(decodeURIComponent(escape(atob(j.content || '')))); } catch { return undefined; }
    },
    async set(name, key, value) { await putJson(path(name, key), value); },
    async del(name, key) {
      const p = path(name, key);
      const head = await f(`${api}/repos/${owner}/${repo}/contents/${p}?ref=${branch}`, { headers: auth });
      if (!head.ok) return;
      const { sha } = await head.json();
      await f(`${api}/repos/${owner}/${repo}/contents/${p}`, {
        method: 'DELETE', headers: auth,
        body: JSON.stringify({ message: `chore(data): remove ${p}`, sha, branch })
      });
    },
    async all(name) {
      const keys = await listKeys(name);
      const out = [];
      for (const key of keys) {
        const v = await this.get(name, key);
        if (v !== undefined) out.push(v);
      }
      return out;
    },
    async clear(name) {
      for (const key of await listKeys(name)) await this.del(name, key);
    }
  };
}

/** نوشتن روی هر دو لایه، خواندن از اصلی و در نبود آن از آینه */
export function createMirrorBackend(primary, secondary) {
  if (!secondary) return primary;
  const safe = async (fn) => { try { return await fn(); } catch (e) { console.warn('[rasad] mirror sync failed:', e.message); return undefined; } };
  return {
    id: `mirror(${primary.id}+${secondary.id})`,
    async get(name, key) {
      const v = await primary.get(name, key);
      if (v !== undefined) return v;
      return safe(() => secondary.get(name, key));
    },
    async set(name, key, value) {
      await primary.set(name, key, value);
      await safe(() => secondary.set(name, key, value));
    },
    async del(name, key) {
      await primary.del(name, key);
      await safe(() => secondary.del(name, key));
    },
    async all(name) {
      const a = await primary.all(name);
      if (a.length) return a;
      const b = (await safe(() => secondary.all(name))) || [];
      return b;
    },
    async clear(name) {
      await primary.clear(name);
      await safe(() => secondary.clear(name));
    }
  };
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

const S = {
  users: 'users',
  session: 'session',
  follows: 'follows',
  likes: 'likes',
  saves: 'saves',
  seen: 'seen',
  comments: 'comments',
  posts: 'posts',
  prices: 'prices',
  settings: 'settings'
};

export class Store {
  constructor(backend, { now = () => Date.now(), sessionId = 'current' } = {}) {
    this.backend = backend;
    this.now = now;
    this.sessionId = sessionId;
  }

  /* ---------- کاربران و احراز هویت ---------- */

  async listUsers() { return this.backend.all(S.users); }

  async getUserById(id) { return this.backend.get(S.users, id); }

  async findUser(username) {
    const u = String(username || '').trim().toLowerCase();
    if (!u) return undefined;
    return (await this.listUsers()).find((x) => x.username === u);
  }

  async register({ username, password, displayName, email }) {
    const u = String(username || '').trim().toLowerCase();
    if (!/^[a-z0-9_.]{3,24}$/.test(u)) throw new Error('نام کاربری باید ۳ تا ۲۴ حرف انگلیسی، عدد، نقطه یا زیرخط باشد');
    if (String(password || '').length < 6) throw new Error('رمز عبور باید حداقل ۶ نویسه باشد');
    if (await this.findUser(u)) throw new Error('این نام کاربری قبلاً ثبت شده است');

    const salt = randomSalt(16);
    const user = {
      id: uid('usr'),
      username: u,
      displayName: String(displayName || u).trim().slice(0, 40),
      email: String(email || '').trim(),
      salt,
      hash: await hashPassword(password, salt),
      createdAt: this.now(),
      bio: '',
      avatarHue: Math.floor(Math.random() * 360)
    };
    await this.backend.set(S.users, user.id, user);
    await this.backend.set(S.session, this.sessionId, { userId: user.id, at: this.now() });
    return user;
  }

  async login(username, password) {
    const user = await this.findUser(username);
    if (!user) throw new Error('حساب کاربری با این نام پیدا نشد');
    const hash = await hashPassword(password, user.salt);
    if (hash !== user.hash) throw new Error('رمز عبور اشتباه است');
    await this.backend.set(S.session, this.sessionId, { userId: user.id, at: this.now() });
    return user;
  }

  async logout() { await this.backend.del(S.session, this.sessionId); }

  async currentUser() {
    const s = await this.backend.get(S.session, this.sessionId);
    if (!s?.userId) return null;
    const u = await this.getUserById(s.userId);
    return u || null;
  }

  /** پروفایل عمومی (بدون هش/نمک) */
  static publicUser(u) {
    if (!u) return null;
    const { salt, hash, ...rest } = u;
    return rest;
  }

  async updateProfile(patch) {
    const u = await this.currentUser();
    if (!u) throw new AuthError();
    const next = { ...u, ...patch, id: u.id, username: u.username, hash: u.hash, salt: u.salt };
    await this.backend.set(S.users, u.id, next);
    return next;
  }

  /* ---------- دنبال کردن خبرگزاری‌ها ---------- */

  async followings() {
    const u = await this.currentUser();
    if (!u) return [];
    const rec = await this.backend.get(S.follows, u.id);
    return rec?.list || [];
  }

  async isFollowing(agencyId) {
    return (await this.followings()).includes(agencyId);
  }

  async toggleFollow(agencyId) {
    const u = await this.currentUser();
    if (!u) throw new AuthError('برای دنبال کردن خبرگزاری‌ها وارد حساب شوید');
    const list = await this.followings();
    const next = list.includes(agencyId) ? list.filter((x) => x !== agencyId) : [...list, agencyId];
    await this.backend.set(S.follows, u.id, { userId: u.id, list: next, updatedAt: this.now() });
    return next;
  }

  /* ---------- لایک / ذخیره / استوری دیده‌شده ---------- */

  async _toggle(storeName, targetId) {
    const u = await this.currentUser();
    if (!u) throw new AuthError('برای این کار وارد حساب شوید');
    const rec = (await this.backend.get(storeName, u.id)) || { userId: u.id, list: [] };
    const has = rec.list.includes(targetId);
    rec.list = has ? rec.list.filter((x) => x !== targetId) : [...rec.list, targetId];
    rec.updatedAt = this.now();
    await this.backend.set(storeName, u.id, rec);
    return !has;
  }

  async toggleLike(targetId) { return this._toggle(S.likes, targetId); }
  async toggleSave(targetId) { return this._toggle(S.saves, targetId); }
  async likedIds() {
    const u = await this.currentUser();
    if (!u) return [];
    return (await this.backend.get(S.likes, u.id))?.list || [];
  }
  async savedIds() {
    const u = await this.currentUser();
    if (!u) return [];
    return (await this.backend.get(S.saves, u.id))?.list || [];
  }

  async markStorySeen(storyKey) {
    const u = await this.currentUser();
    const id = u?.id || 'guest';
    const rec = (await this.backend.get(S.seen, id)) || { id, list: [] };
    if (!rec.list.includes(storyKey)) {
      rec.list.push(storyKey);
      rec.updatedAt = this.now();
      await this.backend.set(S.seen, id, rec);
    }
  }

  async seenStoryKeys() {
    const u = await this.currentUser();
    const id = u?.id || 'guest';
    return (await this.backend.get(S.seen, id))?.list || [];
  }

  /* ---------- کامنت‌ها (فقط کاربران واردشده) ---------- */

  async addComment({ targetId, targetType = 'post', text }) {
    const u = await this.currentUser();
    if (!u) throw new AuthError();
    const body = String(text || '').trim();
    if (!body) throw new Error('متن کامنت خالی است');
    if (body.length > 1500) throw new Error('کامنت خیلی طولانی است (حداکثر ۱۵۰۰ نویسه)');
    if (!targetId) throw new Error('هدف کامنت مشخص نیست');

    const comment = {
      id: uid('cmt'),
      targetId,
      targetType,
      userId: u.id,
      author: u.displayName || u.username,
      username: u.username,
      text: body,
      createdAt: this.now()
    };
    await this.backend.set(S.comments, comment.id, comment);
    return comment;
  }

  async listComments(targetId) {
    const all = await this.backend.all(S.comments);
    return all
      .filter((c) => c.targetId === targetId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async countComments(targetId) {
    return (await this.listComments(targetId)).length;
  }

  async deleteComment(id) {
    const u = await this.currentUser();
    if (!u) throw new AuthError();
    const c = await this.backend.get(S.comments, id);
    if (!c) return false;
    if (c.userId !== u.id) throw new Error('فقط نویسندهٔ کامنت می‌تواند آن را حذف کند');
    await this.backend.del(S.comments, id);
    return true;
  }

  /* ---------- آرشیو پست‌ها (اخبار) ---------- */

  /** درج/بروزرسانی دسته‌ای پست‌ها با شناسهٔ یکتا */
  async putPosts(items) {
    let added = 0, updated = 0;
    for (const item of items || []) {
      if (!item?.id) continue;
      const exists = await this.backend.get(S.posts, item.id);
      await this.backend.set(S.posts, item.id, { ...item, archivedAt: this.now(), ...(exists ? {} : { firstSeenAt: this.now() }) });
      exists ? updated++ : added++;
    }
    return { added, updated, total: (items || []).length };
  }

  async getPost(id) { return this.backend.get(S.posts, id); }

  async allPosts() {
    const all = await this.backend.all(S.posts);
    return all.sort((a, b) => (b.date || 0) - (a.date || 0));
  }

  /**
   * پرس‌وجوی پست‌ها
   * @param {object} o  {sourceId, topic, followings, q, limit, before, after, withImage}
   */
  async queryPosts({ sourceId, topic, sourceIds, q, limit = 30, before, after, withImage = false } = {}) {
    let list = await this.allPosts();
    if (sourceId) list = list.filter((p) => p.sourceId === sourceId);
    if (sourceIds?.length) list = list.filter((p) => sourceIds.includes(p.sourceId));
    if (topic) list = list.filter((p) => p.topic === topic);
    if (withImage) list = list.filter((p) => p.img);
    if (after) list = list.filter((p) => p.date > after);
    if (before) list = list.filter((p) => p.date < before);
    if (q) {
      const needle = String(q).trim().toLowerCase();
      list = list.filter((p) => `${p.title} ${p.desc} ${p.sourceName}`.toLowerCase().includes(needle));
    }
    return list.slice(0, limit);
  }

  async countPosts(sourceId) {
    const all = await this.allPosts();
    return sourceId ? all.filter((p) => p.sourceId === sourceId).length : all.length;
  }

  /** حذف اخبار قدیمی‌تر از n روز (پست‌ها تاریخ انقضا ندارند، اما آرشیو سبک می‌ماند) */
  async pruneNews(days = APP.RETENTION.newsDays, now = this.now()) {
    const cutoff = now - days * 864e5;
    const all = await this.backend.all(S.posts);
    let removed = 0;
    for (const p of all) {
      if ((p.date || 0) < cutoff) {
        await this.backend.del(S.posts, p.id);
        removed++;
      }
    }
    return removed;
  }

  /* ---------- تاریخچهٔ قیمت‌ها ---------- */

  /**
   * نقاط قیمتی: [{ t: timestamp, v: value, o,h,l, src }]
   * تکراری‌ها بر اساس t جایگزین می‌شوند.
   */
  async putPricePoints(assetKey, points) {
    const rec = (await this.backend.get(S.prices, assetKey)) || { key: assetKey, series: [] };
    const map = new Map(rec.series.map((p) => [p.t, p]));
    let added = 0;
    for (const p of points || []) {
      if (!p || !isFinite(p.t) || !isFinite(p.v)) continue;
      if (!map.has(p.t)) added++;
      map.set(p.t, p);
    }
    rec.series = [...map.values()].sort((a, b) => a.t - b.t);
    rec.updatedAt = this.now();
    await this.backend.set(S.prices, assetKey, rec);
    return added;
  }

  async getPriceHistory(assetKey, { from, to } = {}) {
    const rec = await this.backend.get(S.prices, assetKey);
    let series = rec?.series || [];
    if (from) series = series.filter((p) => p.t >= from);
    if (to) series = series.filter((p) => p.t <= to);
    return series;
  }

  async priceKeys() {
    return (await this.backend.all(S.prices)).map((r) => r.key);
  }

  async prunePrices(days = APP.RETENTION.priceDays, now = this.now()) {
    const cutoff = now - days * 864e5;
    const all = await this.backend.all(S.prices);
    let removed = 0;
    for (const rec of all) {
      const kept = rec.series.filter((p) => p.t >= cutoff);
      if (kept.length !== rec.series.length) {
        rec.series = kept;
        await this.backend.set(S.prices, rec.key, rec);
        removed += 1;
      }
    }
    return removed;
  }

  /* ---------- تنظیمات ---------- */

  async getSetting(key, fallback = null) {
    const v = await this.backend.get(S.settings, key);
    return v === undefined ? fallback : v;
  }

  async setSetting(key, value) { await this.backend.set(S.settings, key, value); }

  /* ---------- پشتیبان‌گیری ---------- */

  async exportAll() {
    const dump = {};
    for (const name of Object.values(S)) {
      dump[name] = await this.backend.all(name);
    }
    dump._meta = { app: APP.name, version: APP.version, exportedAt: this.now() };
    return dump;
  }

  async importAll(dump) {
    if (!dump || typeof dump !== 'object') throw new Error('فایل پشتیبان معتبر نیست');
    let count = 0;
    for (const [name, rows] of Object.entries(dump)) {
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        const key = row.id || row.userId || row.key;
        if (!key) continue;
        await this.backend.set(name, key, row);
        count++;
      }
    }
    return count;
  }

  async stats() {
    const [users, posts, prices, comments] = await Promise.all([
      this.listUsers(), this.allPosts(), this.backend.all(S.prices), this.backend.all(S.comments)
    ]);
    return {
      users: users.length,
      posts: posts.length,
      assets: prices.length,
      pricePoints: prices.reduce((a, r) => a + (r.series?.length || 0), 0),
      comments: comments.length
    };
  }
}

/** ساخت استور با بهترین بک‌اند موجود در محیط اجرا */
export function createStore({ backend, sessionId } = {}) {
  let b = backend;
  if (!b) {
    if (typeof indexedDB !== 'undefined') {
      try { b = createIndexedDBBackend(); } catch { b = null; }
    }
    if (!b && typeof localStorage !== 'undefined') b = createLocalStorageBackend(localStorage);
    if (!b) b = createMemoryBackend();
  }
  return new Store(b, { sessionId });
}
