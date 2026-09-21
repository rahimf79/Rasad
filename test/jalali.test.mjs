import test from 'node:test';
import assert from 'node:assert/strict';

import {
  toJalaali, toGregorian, jalaliToTimestamp, parseJalaliDateTime,
  formatJalali, formatJalaliLong, dateToJalali, JALALI_MONTHS
} from '../assets/js/lib/jalali.js';

test('نوروز: ۱ فروردین به ۲۰/۲۱ مارس نگاشت می‌شود', () => {
  assert.deepEqual(toGregorian(1403, 1, 1), { gy: 2024, gm: 3, gd: 20 });
  assert.deepEqual(toGregorian(1404, 1, 1), { gy: 2025, gm: 3, gd: 21 });
  assert.deepEqual(toGregorian(1405, 1, 1), { gy: 2026, gm: 3, gd: 21 });
});

test('۳۰ شهریور ۱۴۰۵ = ۲۱ سپتامبر ۲۰۲۶ (تاریخ واقعی صفحهٔ ثروتمندی)', () => {
  assert.deepEqual(toGregorian(1405, 6, 30), { gy: 2026, gm: 9, gd: 21 });
  assert.deepEqual(toJalaali(2026, 9, 21), { jy: 1405, jm: 6, jd: 30 });
});

test('رفت و برگشت تاریخ برای یک بازهٔ چندساله پایدار است', () => {
  for (let i = 0; i < 1200; i++) {
    const base = new Date(2020, 0, 1);
    base.setDate(base.getDate() + i);
    const j = toJalaali(base.getFullYear(), base.getMonth() + 1, base.getDate());
    const g = toGregorian(j.jy, j.jm, j.jd);
    assert.deepEqual(g, { gy: base.getFullYear(), gm: base.getMonth() + 1, gd: base.getDate() }, `روز ${i}`);
  }
});

test('تجزیهٔ رشتهٔ تاریخ ثروتمندی با ساعت', () => {
  const ts = parseJalaliDateTime('1405/06/30 16:59:00');
  const d = new Date(ts);
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth() + 1, 9);
  assert.equal(d.getDate(), 21);
  assert.equal(d.getHours(), 16);
  assert.equal(d.getMinutes(), 59);
});

test('تجزیهٔ ارقام فارسی و جداکنندهٔ خط تیره', () => {
  const a = parseJalaliDateTime('۱۴۰۵-۰۶-۳۰ ۱۶:۵۹');
  const b = parseJalaliDateTime('1405/06/30 16:59');
  assert.equal(a, b);
});

test('تاریخ میلادی ISO هم پذیرفته می‌شود', () => {
  const ts = parseJalaliDateTime('2026-09-21T13:29:00Z');
  assert.ok(ts > 0);
});

test('فرمت جلالی با ارقام فارسی', () => {
  const ts = jalaliToTimestamp(1405, 6, 30, 16, 59, 0);
  assert.equal(formatJalali(ts), '۱۴۰۵/۰۶/۳۰ - ۱۶:۵۹');
  assert.equal(formatJalali(ts, { seconds: true }), '۱۴۰۵/۰۶/۳۰ - ۱۶:۵۹:۰۰');
  assert.equal(formatJalali(ts, { withTime: false }), '۱۴۰۵/۰۶/۳۰');
  assert.equal(formatJalaliLong(ts), '۳۰ شهریور ۱۴۰۵');
});

test('dateToJalali نام ماه و روز هفته را برمی‌گرداند', () => {
  const j = dateToJalali(jalaliToTimestamp(1405, 6, 30, 10, 0, 0));
  assert.equal(j.jy, 1405);
  assert.equal(j.monthName, JALALI_MONTHS[5]);
  assert.equal(j.monthName, 'شهریور');
  assert.ok(JALALI_MONTHS.length === 12);
});

test('ورودی نامعتبر null می‌دهد', () => {
  assert.equal(parseJalaliDateTime(''), null);
  assert.equal(parseJalaliDateTime('متن بدون تاریخ'), null);
  assert.equal(formatJalali(NaN), '—');
});
