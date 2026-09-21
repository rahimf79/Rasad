/**
 * تبدیل تاریخ میلادی ⇄ جلالی
 * الگوریتم: jalaali-js (https://github.com/jalaali/jalaali-js) - MIT
 * فقط بخش‌های مورد نیاز، بدون وابستگی خارجی.
 */

const div = (a, b) => ~~(a / b);
const mod = (a, b) => a - ~~(a / b) * b;

export const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
];

export const JALALI_WEEKDAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];

const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

function jalCal(jy) {
  const bl = BREAKS.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0];
  let jump = 0;

  if (jy < jp || jy >= BREAKS[bl - 1]) throw new Error('Invalid Jalaali year ' + jy);

  for (let i = 1; i < bl; i += 1) {
    const jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }

  let n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;

  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;

  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;

  return { leap, gy, march };
}

function g2d(gy, gm, gd) {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn) {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

function j2d(jy, jm, jd) {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function d2j(jdn) {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, r.march);
  let k = jdn - jdn1f;
  let jm, jd;

  if (k >= 0) {
    if (k <= 185) {
      jm = 1 + div(k, 31);
      jd = mod(k, 31) + 1;
      return { jy, jm, jd };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  jm = 7 + div(k, 30);
  jd = mod(k, 30) + 1;
  return { jy, jm, jd };
}

/** میلادی → جلالی */
export function toJalaali(gy, gm, gd) {
  return d2j(g2d(gy, gm, gd));
}

/** جلالی → میلادی */
export function toGregorian(jy, jm, jd) {
  return d2g(j2d(jy, jm, jd));
}

/** شیء Date → {jy,jm,jd,hh,mm,ss} */
export function dateToJalali(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d)) return null;
  const j = toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return {
    ...j,
    hh: d.getHours(),
    mm: d.getMinutes(),
    ss: d.getSeconds(),
    weekday: JALALI_WEEKDAYS[(d.getDay() + 1) % 7],
    monthName: JALALI_MONTHS[j.jm - 1]
  };
}

/** جلالی → timestamp (میلی‌ثانیه) */
export function jalaliToTimestamp(jy, jm, jd, hh = 0, mm = 0, ss = 0) {
  const g = toGregorian(jy, jm, jd);
  return new Date(g.gy, g.gm - 1, g.gd, hh, mm, ss).getTime();
}

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const toEnDigits = (s) => String(s).replace(/[۰-۹٠-٩]/g, (c) => {
  const i = FA_DIGITS.indexOf(c);
  if (i >= 0) return String(i);
  return String(c.charCodeAt(0) - 0x0660);
});
const toFaDigits = (s) => String(s).replace(/\d/g, (d) => FA_DIGITS[+d]);

/**
 * تجزیهٔ رشته‌های تاریخ ثروتمندی و منابع فارسی.
 * پشتیبانی از: «1405/06/30 16:59:00»، «1405-06-30»، «۱۴۰۵/۰۶/۳۰ ۱۶:۵۹»،
 * و تاریخ میلادی استاندارد (ISO / RFC).
 */
export function parseJalaliDateTime(input) {
  if (!input) return null;
  const raw = toEnDigits(String(input)).trim();

  const m = raw.match(/(1[2-5]\d{2})[\/\-.](\d{1,2})[\/\-.](\d{1,2})(?:[ T]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (m) {
    const [, jy, jm, jd, hh = '0', mm = '0', ss = '0'] = m;
    try {
      return jalaliToTimestamp(+jy, +jm, +jd, +hh, +mm, +ss);
    } catch {
      return null;
    }
  }

  // تاریخ میلادی
  const iso = new Date(raw);
  return isNaN(iso) ? null : iso.getTime();
}

const pad = (n) => String(n).padStart(2, '0');

/** 1405/06/30 - 16:59 */
export function formatJalali(ts, { withTime = true, seconds = false } = {}) {
  if (ts == null || isNaN(ts)) return '—';
  const j = dateToJalali(ts);
  if (!j) return '—';
  const date = `${j.jy}/${pad(j.jm)}/${pad(j.jd)}`;
  if (!withTime) return toFaDigits(date);
  const time = seconds ? `${pad(j.hh)}:${pad(j.mm)}:${pad(j.ss)}` : `${pad(j.hh)}:${pad(j.mm)}`;
  return toFaDigits(`${date} - ${time}`);
}

/** ۳۰ شهریور ۱۴۰۵ */
export function formatJalaliLong(ts) {
  const j = dateToJalali(ts);
  if (!j) return '—';
  return toFaDigits(`${j.jd} ${j.monthName} ${j.jy}`);
}

export { toEnDigits, toFaDigits };
