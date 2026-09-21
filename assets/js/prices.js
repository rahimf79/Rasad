/** منطق قیمت‌ها: نرمال‌سازی دادهٔ ثروتمندی، آمار بازه، و تولید نمودار SVG */

import { ENTITY_BY_KEY, PRICE_ENTITIES } from './config.js';
import { nf, money, toFaDigits, esc, dirCls } from './lib/util.js';
import { formatJalali, formatJalaliLong } from './lib/jalali.js';

export const RANGES = [
  { id: '24h', label: '۲۴ ساعت', ms: 24 * 3600e3 },
  { id: '3d', label: '۳ روز', ms: 3 * 24 * 3600e3 },
  { id: '7d', label: '۷ روز', ms: 7 * 24 * 3600e3 },
  { id: '30d', label: '۱ ماه', ms: 30 * 24 * 3600e3 },
  { id: '90d', label: '۳ ماه', ms: 90 * 24 * 3600e3 },
  { id: '1y', label: '۱ سال', ms: 365 * 24 * 3600e3 },
  { id: 'all', label: 'همه', ms: Infinity }
];

export const rangeById = (id) => RANGES.find((r) => r.id === id) || RANGES[2];

/** ریال → تومان */
export const rialToToman = (v) => (Number(v) || 0) / 10;

/** مقدار خام منبع را به «مقدار نمایشی» تبدیل می‌کند */
export function displayValue(raw, unit) {
  if (unit === 'rial') return rialToToman(raw);
  return Number(raw) || 0;
}

export const unitLabel = (unit) => (unit === 'rial' ? 'تومان' : unit === 'usd' ? 'دلار' : '');

/**
 * نرمال‌سازی یک اسنپ‌شات از ثروتمندی.
 * @param {object} raw {code,key,last,first,high,low,prev,time,source}
 */
export function normalizeSnapshot(raw) {
  const ent = ENTITY_BY_KEY[raw.key] || PRICE_ENTITIES.find((e) => e.code === String(raw.code));
  if (!ent) return null;
  const unit = ent.unit;
  const last = displayValue(raw.last, unit);
  const first = displayValue(raw.first, unit);
  const high = displayValue(raw.high, unit);
  const low = displayValue(raw.low, unit);
  const prev = displayValue(raw.prev, unit);
  const base = prev || first || last;
  const change = base ? last - base : 0;
  const changePct = base ? (change / base) * 100 : 0;

  return {
    key: ent.key,
    code: ent.code,
    name: ent.name,
    short: ent.short,
    group: ent.group,
    icon: ent.icon,
    unit,
    unitLabel: unitLabel(unit),
    last, first, high, low, prev,
    change, changePct,
    time: raw.time || null,
    source: raw.source || 'ثروتمندی',
    sourceUrl: `https://servatmandi.com/Entity/Summary/${ent.code}`
  };
}

/** آمار یک بازه از سری زمانی */
export function rangeStats(series, { from, to } = {}) {
  let s = series || [];
  if (from) s = s.filter((p) => p.t >= from);
  if (to) s = s.filter((p) => p.t <= to);
  if (!s.length) return null;

  const values = s.map((p) => p.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const sum = values.reduce((a, b) => a + b, 0);
  const first = s[0];
  const last = s[s.length - 1];
  const change = last.v - first.v;
  const changePct = first.v ? (change / first.v) * 100 : 0;
  const minPoint = s[values.indexOf(min)];
  const maxPoint = s[values.indexOf(max)];

  return {
    points: s.length,
    min, max, avg: sum / values.length,
    first: first.v, last: last.v,
    change, changePct,
    minAt: minPoint.t, maxAt: maxPoint.t,
    from: first.t, to: last.t
  };
}

/** نزدیک‌ترین نقطهٔ ثبت‌شده به یک زمان (برای «در فلان زمان این قیمت بوده») */
export function priceAt(series, ts) {
  if (!series?.length) return null;
  let best = series[0];
  let bestDiff = Math.abs(series[0].t - ts);
  for (const p of series) {
    const d = Math.abs(p.t - ts);
    if (d < bestDiff) { best = p; bestDiff = d; }
  }
  return { ...best, exactMatch: bestDiff === 0, diffMs: bestDiff };
}

/** میانگین متحرک ساده */
export function sma(series, window) {
  const out = [];
  for (let i = 0; i < series.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = series.slice(start, i + 1);
    out.push({ t: series[i].t, v: slice.reduce((a, b) => a + b.v, 0) / slice.length });
  }
  return out;
}

/** نازک‌سازی سری برای نمودار (حداکثر n نقطه) */
export function thinSeries(series, n = 240) {
  if (!series || series.length <= n) return series || [];
  const step = series.length / n;
  const out = [];
  for (let i = 0; i < n; i++) out.push(series[Math.floor(i * step)]);
  out.push(series[series.length - 1]);
  return out;
}

/* ------------------------------------------------------------------ */
/* نمودار SVG (بدون وابستگی خارجی)                                     */
/* ------------------------------------------------------------------ */

function scale(v, min, max, lo, hi) {
  if (max === min) return (lo + hi) / 2;
  return hi - ((v - min) / (max - min)) * (hi - lo);
}

/** اسپارک‌لاین کوچک برای کارت‌ها */
export function sparkline(series, { w = 120, h = 34, up = true } = {}) {
  if (!series || series.length < 2) return '';
  const values = series.map((p) => p.v);
  const min = Math.min(...values), max = Math.max(...values);
  const pts = series.map((p, i) => {
    const x = (i / (series.length - 1)) * w;
    const y = scale(p.v, min, max, 2, h - 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const color = up ? '#22c55e' : '#ef4444';
  const gid = `sp${Math.abs(w * h * (up ? 1 : 2)) | 0}`;
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity=".35"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    <polygon points="0,${h} ${pts} ${w},${h}" fill="url(#${gid})"/>
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
  </svg>`;
}

/**
 * نمودار کامل با محور، شبکه، نقاط داده و داده‌های tooltip.
 * هر نقطه با data-t / data-v مشخص می‌شود تا «قیمت در فلان زمان» دقیق نشان داده شود.
 */
export function priceChart(series, {
  w = 720, h = 300, up = true, label = '', unitLabel: ul = '', maxPoints = 300
} = {}) {
  const s = thinSeries(series, maxPoints);
  if (!s || s.length < 2) {
    return `<div class="chart-empty">برای رسم نمودار به حداقل دو نقطهٔ قیمتی نیاز است. با هر بار جمع‌آوری، آرشیو کامل‌تر می‌شود.</div>`;
  }

  const padL = 8, padR = 8, padT = 16, padB = 26;
  const iw = w - padL - padR;
  const ih = h - padT - padB;
  const values = s.map((p) => p.v);
  let min = Math.min(...values), max = Math.max(...values);
  const padY = (max - min) * 0.12 || Math.max(1, Math.abs(max) * 0.02);
  min -= padY; max += padY;

  const x = (i) => padL + (i / (s.length - 1)) * iw;
  const y = (v) => padT + scale(v, min, max, 0, ih);

  const line = s.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const area = `${padL},${padT + ih} ${line} ${(padL + iw).toFixed(1)},${padT + ih}`;
  const color = up ? '#22c55e' : '#ef4444';
  const gid = `pc_${Math.abs(s[0].t) % 100000}`;

  // خطوط افقی شبکه + برچسب قیمت
  const ticks = 4;
  let grid = '';
  for (let i = 0; i <= ticks; i++) {
    const v = min + ((max - min) * i) / ticks;
    const yy = y(v);
    grid += `<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${padL + iw}" y2="${yy.toFixed(1)}" class="chart-grid"/>`;
    grid += `<text x="${padL}" y="${(yy - 4).toFixed(1)}" class="chart-axis">${esc(money(v))}</text>`;
  }

  // برچسب‌های زمانی
  let xlabels = '';
  const nLabels = Math.min(5, s.length);
  for (let i = 0; i < nLabels; i++) {
    const idx = Math.round((i * (s.length - 1)) / (nLabels - 1 || 1));
    xlabels += `<text x="${x(idx).toFixed(1)}" y="${h - 8}" class="chart-axis" text-anchor="middle">${esc(formatJalali(s[idx].t, { withTime: false }))}</text>`;
  }

  const dots = s.map((p, i) =>
    `<circle class="chart-dot" cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="2.6" data-t="${p.t}" data-v="${p.v}" data-src="${esc(p.src || '')}"><title>${esc(formatJalali(p.t, { seconds: true }))} — ${esc(money(p.v))} ${esc(ul)}</title></circle>`
  ).join('');

  return `<div class="chart-wrap" data-unit="${esc(ul)}">
    <svg class="price-chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}">
      <defs>
        <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity=".38"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${grid}
      <polygon points="${area}" fill="url(#${gid})"/>
      <polyline points="${line}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
      ${dots}
      ${xlabels}
    </svg>
    <div class="chart-tip" hidden></div>
  </div>`;
}

/** جدول «در فلان زمان این قیمت بوده» */
export function priceTimeline(series, { limit = 12, unitLabel: ul = '' } = {}) {
  const rows = [...(series || [])].sort((a, b) => b.t - a.t).slice(0, limit);
  if (!rows.length) return '<div class="muted center">هنوز نقطهٔ قیمتی ثبت نشده است.</div>';
  return `<div class="table-wrap"><table class="mini-table">
    <thead><tr><th>زمان دقیق</th><th>قیمت</th><th>تغییر</th><th>منبع</th></tr></thead>
    <tbody>${rows.map((p, i) => {
      const prev = rows[i + 1];
      const chg = prev && prev.v ? ((p.v - prev.v) / prev.v) * 100 : 0;
      return `<tr>
        <td class="mono" dir="ltr">${esc(formatJalali(p.t, { seconds: true }))}</td>
        <td class="mono">${esc(money(p.v))} <small>${esc(ul)}</small></td>
        <td class="${dirCls(chg)} mono">${prev ? esc(toFaDigits(chg.toFixed(2))) + '٪' : '—'}</td>
        <td><span class="src-badge">${esc(p.src || 'ثروتمندی')}</span></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

/** کارت خلاصهٔ آمار بازه */
export function statsGrid(st, { unitLabel: ul = '' } = {}) {
  if (!st) return '';
  const cell = (k, v, cls = '') => `<div class="stat-cell"><div class="k">${esc(k)}</div><div class="v ${cls}">${v}</div></div>`;
  return `<div class="stats-grid">
    ${cell('آخرین قیمت', esc(money(st.last)) + ' <small>' + esc(ul) + '</small>')}
    ${cell('آغاز بازه', esc(money(st.first)))}
    ${cell('بیشترین', esc(money(st.max)), 'up')}
    ${cell('کمترین', esc(money(st.min)), 'down')}
    ${cell('میانگین', esc(money(st.avg)))}
    ${cell('تغییر بازه', `<span class="${dirCls(st.change)}">${esc(st.changePct.toFixed(2))}٪</span>`)}
    ${cell('سقف در تاریخ', esc(formatJalaliLong(st.maxAt)))}
    ${cell('کف در تاریخ', esc(formatJalaliLong(st.minAt)))}
    ${cell('تعداد نقاط', esc(nf(st.points)))}
  </div>`;
}
