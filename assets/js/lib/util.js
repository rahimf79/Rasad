/** ابزارهای مشترک - بدون وابستگی به DOM در زمان import */

export const $ = (sel, root) => (root || (typeof document !== 'undefined' ? document : null))?.querySelector(sel) || null;
export const $$ = (sel, root) => [...((root || (typeof document !== 'undefined' ? document : null))?.querySelectorAll(sel) || [])];

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

export const toFaDigits = (v) => String(v).replace(/\d/g, (d) => FA_DIGITS[+d]);
export const toEnDigits = (v) => String(v).replace(/[۰-۹]/g, (c) => String(FA_DIGITS.indexOf(c)));

/** فرمت عدد با جداکنندهٔ فارسی */
export function nf(n, digits = 0) {
  const v = Number(n);
  if (!isFinite(v)) return '—';
  try {
    return new Intl.NumberFormat('fa-IR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
  } catch {
    return toFaDigits(v.toFixed(digits));
  }
}

/** نمایش مبلغ: زیر هزار با اعشار، بالای هزار گرد شده */
export function money(n) {
  const v = Number(n);
  if (!isFinite(v)) return '—';
  if (Math.abs(v) >= 1e9) return nf(v / 1e9, 2) + ' میلیارد';
  if (Math.abs(v) >= 1e6) return nf(Math.round(v));
  if (Math.abs(v) >= 1000) return nf(Math.round(v));
  if (Math.abs(v) >= 1) return nf(v, 2);
  return nf(v, 4);
}

export function pct(n, digits = 2) {
  const v = Number(n) || 0;
  const arrow = v > 0 ? '▲' : v < 0 ? '▼' : '•';
  return `${arrow} ${nf(Math.abs(v), digits)}٪`;
}

export const dirCls = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : 'flat');

/** «۳ دقیقه پیش» */
export function timeAgo(ts, now = Date.now()) {
  const d = Math.max(0, now - Number(ts));
  const m = Math.floor(d / 60000);
  if (m < 1) return 'همین حالا';
  if (m < 60) return toFaDigits(m) + ' دقیقه پیش';
  const h = Math.floor(m / 60);
  if (h < 24) return toFaDigits(h) + ' ساعت پیش';
  const days = Math.floor(h / 24);
  if (days < 30) return toFaDigits(days) + ' روز پیش';
  const mo = Math.floor(days / 30);
  if (mo < 12) return toFaDigits(mo) + ' ماه پیش';
  return toFaDigits(Math.floor(mo / 12)) + ' سال پیش';
}

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export function uid(prefix = 'id') {
  const rnd = (globalThis.crypto?.getRandomValues)
    ? [...globalThis.crypto.getRandomValues(new Uint8Array(6))].map((b) => b.toString(16).padStart(2, '0')).join('')
    : Math.random().toString(16).slice(2, 14);
  return `${prefix}_${Date.now().toString(36)}_${rnd}`;
}

/** فرار از HTML - همهٔ دادهٔ بیرونی قبل از innerHTML از اینجا رد می‌شود */
export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** حذف تگ‌های HTML و فشرده‌سازی فاصله */
export function stripHtml(html) {
  const text = String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&zwnj;|&#8204;/g, '\u200c')
    .replace(/\s+/g, ' ');
  return text.trim();
}

/** استخراج اولین تصویر از محتوای RSS */
export function firstImage(html) {
  const m = String(html ?? '').match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : '';
}

export function debounce(fn, wait = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/* ------------------------------------------------------------------ */
/* SHA-256 خالص (پشتیبان وقتی crypto.subtle در دسترس نیست)             */
/* ------------------------------------------------------------------ */
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

const rotr = (x, n) => (x >>> n) | (x << (32 - n));

export function sha256Hex(message) {
  const bytes = new TextEncoder().encode(String(message));
  const l = bytes.length;
  const bitLen = l * 8;
  const total = (((l + 8) >> 6) + 1) << 6;
  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[l] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, Math.floor(bitLen / 4294967296), false);
  dv.setUint32(total - 4, bitLen >>> 0, false);

  let H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Uint32Array(64);

  for (let i = 0; i < total; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4, false);
    for (let t = 16; t < 64; t++) {
      const x = w[t - 15], y = w[t - 2];
      const s0 = rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
      const s1 = rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H = H.map((x, idx) => (x + [a, b, c, d, e, f, g, h][idx]) >>> 0);
  }
  return H.map((x) => x.toString(16).padStart(8, '0')).join('');
}

/** هش رمز عبور با نمک؛ از crypto.subtle استفاده می‌کند و در نبود آن به sha256 خالص می‌افتد */
export async function hashPassword(password, salt) {
  const payload = `rasad::v1::${salt}::${password}`;
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    try {
      const buf = await subtle.digest('SHA-256', new TextEncoder().encode(payload));
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch { /* fall through */ }
  }
  return sha256Hex(payload);
}

export function randomSalt(len = 16) {
  if (globalThis.crypto?.getRandomValues) {
    return [...globalThis.crypto.getRandomValues(new Uint8Array(len))]
      .map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
}

/** رنگ پایدار از روی رشته (برای آواتار و کاشی خبر بدون تصویر) */
export function hueFromString(str) {
  let h = 0;
  const s = String(str || 'x');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

export function gradientFor(str) {
  const h = hueFromString(str);
  return `linear-gradient(135deg, hsl(${h} 82% 58%), hsl(${(h + 48) % 360} 85% 48%))`;
}
