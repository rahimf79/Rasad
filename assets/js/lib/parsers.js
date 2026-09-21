/**
 * پارسرهای خالص منابع داده.
 * این فایل هم در مرورگر و هم در GitHub Actions (Node) استفاده می‌شود،
 * پس هیچ وابستگی به DOM یا fs ندارد و ورودی همهٔ توابع «متن» است.
 */

import { parseJalaliDateTime } from './jalali.js';

const toEnDigits = (s) => String(s).replace(/[۰-۹٠-٩]/g, (c) => {
  const fa = '۰۱۲۳۴۵۶۷۸۹'.indexOf(c);
  return fa >= 0 ? String(fa) : String(c.charCodeAt(0) - 0x0660);
});

/** تبدیل متن به عدد (با حذف جداکننده و ارقام فارسی) */
export function toNumber(input) {
  if (input == null) return null;
  const s = toEnDigits(String(input)).replace(/[,٬\s۬]/g, '');
  if (!s) return null;
  const m = s.match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return isFinite(n) ? n : null;
}

/** متن خالص از HTML (با جداکنندهٔ خط برای پارسرهای برچسب/مقدار) */
export function htmlToLines(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(tr|li|p|div|h[1-6]|td|th)>/gi, '\n')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&zwnj;|&#8204;/g, '\u200c')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

const decodeCdata = (s) => String(s || '').replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1').trim();

function pickTag(chunk, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = chunk.match(re);
  return m ? decodeCdata(m[1]) : '';
}

function pickAttr(chunk, tag, attr) {
  const re = new RegExp(`<${tag}[^>]*${attr}\\s*=\\s*["']([^"']+)["']`, 'i');
  const m = chunk.match(re);
  return m ? m[1] : '';
}

/* ------------------------------------------------------------------ */
/* RSS                                                                 */
/* ------------------------------------------------------------------ */

/**
 * تجزیهٔ RSS/Atom بدون وابستگی خارجی.
 * @returns {Array<{title,description,content,link,pubDate,thumbnail}>}
 */
export function parseRss(xml) {
  const src = String(xml || '');
  if (!src) return [];

  // Atom
  if (/<feed[\s>]/i.test(src) && !/<rss[\s>]/i.test(src)) {
    return src.split(/<entry[\s>]/i).slice(1).map((chunk0) => {
      const chunk = chunk0.split(/<\/entry>/i)[0];
      const link = pickAttr(chunk, 'link', 'href') || pickTag(chunk, 'link');
      const updated = pickTag(chunk, 'updated') || pickTag(chunk, 'published');
      return {
        title: decodeCdata(pickTag(chunk, 'title')),
        description: decodeCdata(pickTag(chunk, 'summary') || pickTag(chunk, 'content')),
        content: decodeCdata(pickTag(chunk, 'content')),
        link,
        pubDate: updated,
        thumbnail: pickAttr(chunk, 'media:thumbnail', 'url') || pickAttr(chunk, 'media:content', 'url')
      };
    }).filter((x) => x.title);
  }

  return src.split(/<item[\s>]/i).slice(1).map((chunk0) => {
    const chunk = chunk0.split(/<\/item>/i)[0];
    const title = decodeCdata(pickTag(chunk, 'title'));
    const description = decodeCdata(pickTag(chunk, 'description'));
    const content = decodeCdata(pickTag(chunk, 'content:encoded') || pickTag(chunk, 'content'));
    let link = pickTag(chunk, 'link');
    if (!link) link = pickAttr(chunk, 'guid', 'href') || pickTag(chunk, 'guid');
    const pubDate = pickTag(chunk, 'pubDate') || pickTag(chunk, 'dc:date') || pickTag(chunk, 'pubdate');
    const thumbnail =
      pickAttr(chunk, 'media:content', 'url') ||
      pickAttr(chunk, 'media:thumbnail', 'url') ||
      pickAttr(chunk, 'enclosure', 'url') ||
      (content.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || '') ||
      (description.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || '');
    return { title, description, content, link: link.trim(), pubDate, thumbnail };
  }).filter((x) => x.title);
}

/* ------------------------------------------------------------------ */
/* ثروتمندی (servatmandi.com)                                          */
/* ------------------------------------------------------------------ */

const SM_LABELS = {
  time: ['آخرین تغییرات'],
  last: ['آخرین قیمت', 'آخرین ارزش'],
  first: ['اولین قیمت', 'اولین ارزش'],
  high: ['بیشترین قیمت', 'بیشترین ارزش'],
  low: ['کمترین قیمت', 'کمترین ارزش'],
  prev: ['روز کاری قبلی']
};

/** توکن‌های باقی‌ماندهٔ یک خط پس از برچسب (برای جدول‌های تک‌خطی و markdown) */
function tokensAfterLabel(line, label) {
  const key = String(label).replace(/\s/g, '');
  const parts = String(line)
    .split(/[\s|،،]+/)
    .map((t) => t.replace(/^[:：]+|[:：]+$/g, ''))
    .filter(Boolean);
  let acc = '';
  for (let i = 0; i < parts.length; i++) {
    acc += parts[i].replace(/[\u200c]/g, '');
    if (acc.includes(key)) return parts.slice(i + 1);
  }
  return [];
}

function findAfterNumber(lines, labels) {
  for (const label of labels) {
    const key = label.replace(/\s/g, '');
    const idx = lines.findIndex((l) => l.replace(/\s/g, '').includes(key));
    if (idx < 0) continue;

    // ۱) همان خط — اولین توکن عددی پس از برچسب
    for (const token of tokensAfterLabel(lines[idx], label)) {
      if (!/\d/.test(token)) continue;
      const n = toNumber(token);
      if (n !== null && n !== 0) return n;
    }

    // ۲) خط‌های بعدی
    for (let j = idx + 1; j < Math.min(idx + 5, lines.length); j++) {
      const n = toNumber(lines[j]);
      if (n !== null && n !== 0) return n;
    }
  }
  return null;
}

function findAfterText(lines, labels) {
  for (const label of labels) {
    const key = label.replace(/\s/g, '');
    const idx = lines.findIndex((l) => l.replace(/\s/g, '').includes(key));
    if (idx < 0) continue;

    // ۱) همان خط
    const rest = tokensAfterLabel(lines[idx], label).join(' ');
    if (rest && /\d/.test(rest)) return rest;

    // ۲) خط‌های بعدی
    for (let j = idx + 1; j < Math.min(idx + 4, lines.length); j++) {
      if (/\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}/.test(lines[j])) return lines[j];
      if (toNumber(lines[j]) === null) return lines[j];
    }
  }
  return null;
}

/**
 * تجزیهٔ صفحهٔ /Entity/Summary/{code}
 * @returns {null|{code,name,unit,last,first,high,low,prev,timeText,time,source}}
 */
export function parseServatmandiSummary(html, code = '') {
  const src = String(html || '');
  if (!src) return null;

  const lines = htmlToLines(src);
  const last = findAfterNumber(lines, SM_LABELS.last);
  if (last === null) return null;

  const timeText = findAfterText(lines, SM_LABELS.time) || '';
  const time = parseJalaliDateTime(timeText);

  const nameAttr = (src.match(/data-entity-name\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
  const titleTag = (src.match(/<title>([^<]*)<\/title>/i) || [])[1] || '';
  const name = nameAttr ||
    titleTag.replace(/^نمودار قیمت و تحلیل\s*/, '').replace(/\s*در بازار آزاد.*$/, '').replace(/\s*\([^)]*\)\s*$/, '').trim();

  const unitText = `${lines.join(' ')}`;
  let unit = 'rial';
  if (/به\s*دلار/.test(unitText)) unit = 'usd';
  else if (/به\s*ریال/.test(unitText)) unit = 'rial';
  else if (/به\s*تومان/.test(unitText)) unit = 'toman';

  const detectedCode = code || (src.match(/data-entity-code\s*=\s*["'](\d+)["']/i) || [])[1] || '';

  return {
    code: String(detectedCode),
    name: name || 'نامشخص',
    unit,
    last,
    first: findAfterNumber(lines, SM_LABELS.first) ?? last,
    high: findAfterNumber(lines, SM_LABELS.high) ?? last,
    low: findAfterNumber(lines, SM_LABELS.low) ?? last,
    prev: findAfterNumber(lines, SM_LABELS.prev) ?? null,
    timeText,
    time: time || Date.now(),
    source: 'ثروتمندی'
  };
}

/** استخراج فهرست دارایی‌ها از صفحهٔ یک دیدبان (/Entities/{id}) */
export function parseServatmandiEntities(html) {
  const src = String(html || '');
  const out = [];
  const seen = new Set();
  const re = /\/Entity\/Summary\/(\d+)[^>]*>\s*([^<]{2,80})\s*</g;
  let m;
  while ((m = re.exec(src))) {
    const code = m[1];
    const name = decodeCdata(m[2]).replace(/\s+/g, ' ').trim();
    if (!name || seen.has(code)) continue;
    seen.add(code);
    out.push({ code, name });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* TGJU - فقط به‌عنوان پشتیبان برای پرکردن تاریخچهٔ اولیه               */
/* ------------------------------------------------------------------ */

/**
 * تجزیهٔ پاسخ summary-table-data در api.tgju.org
 * ساختار: { data: [ [close, open, high, low, ..., date], ... ] }
 */
export function parseTgjuHistory(json) {
  const rows = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
  return rows
    .map((r) => {
      const date = Array.isArray(r) ? r[7] : r?.date;
      const t = date ? parseJalaliDateTime(String(date)) : null;
      const c = toNumber(Array.isArray(r) ? r[0] : r?.close);
      if (!t || !c) return null;
      return {
        t,
        v: c,
        o: toNumber(Array.isArray(r) ? r[1] : r?.open) ?? c,
        h: toNumber(Array.isArray(r) ? r[2] : r?.high) ?? c,
        l: toNumber(Array.isArray(r) ? r[3] : r?.low) ?? c,
        src: 'TGJU'
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.t - b.t);
}

/* ------------------------------------------------------------------ */
/* باما (bama.ir) - قیمت خودرو                                         */
/* ------------------------------------------------------------------ */

const CAR_BRAND_HINT = /(پراید|کوییک|تیبا|ساینا|شاهین|آریا|پژو|سمند|دنا|تارا|رانا|سورن|هایما|فیدلیتی|دیگنیتی|کیامسی|ام‌وی‌ام|MVM|چانگان|جک|هایما|بسترن|لاماری|فونیکس|تیگو|آریسان|پادرا|شاهین|کادیلاک|بنز|بی‌ام‌و|تویوتا|هیوندای|کیا|رنو|سانگ‌یانگ|چری|برلیان|آریو|وانت|نیسان|زامیاد|ریچ|تویوتا|مازراتی|پورشه)/i;

/**
 * استخراج قیمت خودرو از HTML باما.
 * دو روش مکمل:
 *  1) «نام خودرو … عدد تومان» در یک خط
 *  2) جدول قیمت روز: خط نام، سپس خط عدد
 */
export function parseBamaPrices(html) {
  const src = String(html || '');
  if (!src) return [];
  const text = htmlToLines(src).join('\n');
  const normalized = toEnDigits(text);
  const out = [];
  const seen = new Set();

  const push = (name, price, extra = {}) => {
    const clean = String(name || '').replace(/\s+/g, ' ').replace(/^[-–•\s]+|[-–•\s]+$/g, '').trim();
    if (!clean || clean.length < 3 || clean.length > 60) return;
    if (!price || price < 5e7 || price > 5e12) return; // بازهٔ معقول قیمت خودرو در تومان
    const key = clean;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name: clean, price, ...extra });
  };

  // روش ۱: «نام … ۱٬۲۰۰٬۰۰۰٬۰۰۰ تومان»
  const inline = /([^\n\r]{3,60}?)\s*[:\-–]?\s*([\d,]{7,18})\s*(?:تومان|ریال)/g;
  let m;
  while ((m = inline.exec(normalized))) {
    const candidate = m[1].split('\n').pop().trim();
    if (!CAR_BRAND_HINT.test(candidate)) continue;
    let price = toNumber(m[2]);
    if (price == null) continue;
    if (/ریال/.test(m[0]) && !/تومان/.test(m[0])) price = price / 10;
    push(candidate, price);
  }

  // روش ۲: جدول قیمت روز (خط نام، خط عدد)
  const lines = htmlToLines(normalized);
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i];
    const next = lines[i + 1];
    if (line.length < 3 || line.length > 60) continue;
    if (!CAR_BRAND_HINT.test(line)) continue;
    if (/\d{5,}/.test(line)) continue; // خط خودش عدد قیمت دارد
    const price = toNumber(next);
    if (price == null) continue;
    push(line, price);
  }

  return out;
}
