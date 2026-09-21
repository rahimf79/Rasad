/**
 * پیکربندی مرکزی رصد: خبرگزاری‌ها، موضوعات، و دارایی‌های قیمت‌گذاری.
 * منبع اصلی قیمت‌ها: ثروتمندی (servatmandi.com) — کدهای «entity» از دیدبان‌های خود سایت استخراج شده‌اند.
 */

export const APP = {
  name: 'رصد',
  latin: 'Rasad',
  tagline: 'اینستاگرامِ اخبار و بازار ایران',
  version: '2.0.0',
  /** استوری ۲۴ ساعت زنده می‌ماند، پست‌ها تاریخ انقضا ندارند */
  STORY_TTL_MS: 24 * 60 * 60 * 1000,
  /** فاصلهٔ جمع‌آوری خودکار در مرورگر */
  REFRESH_MS: 5 * 60 * 1000,
  PRICE_REFRESH_MS: 60 * 1000,
  /** سیاست نگهداری آرشیو (روز) */
  RETENTION: { newsDays: 120, priceDays: 1095, commentsDays: 3650 },
  /** مسیر دادهٔ آرشیوشدهٔ منتشرشده روی GitHub Pages */
  DATA_BASE: 'data'
};

/**
 * خبرگزاری‌ها = صفحه‌های اینستاگرامی. هر کدام فید، استوری و پست مستقل دارند.
 * چند آدرس RSS برای هر منبع: اولین موردی که پاسخ دهد استفاده می‌شود.
 */
export const AGENCIES = [
  { id: 'irna', handle: 'irna', name: 'ایرنا', full: 'خبرگزاری جمهوری اسلامی (ایرنا)',
    feeds: ['https://www.irna.ir/rss'], site: 'https://www.irna.ir',
    cat: 'رسمی', color: '#22c55e', bio: 'خبرگزاری رسمی دولت؛ پوشش اخبار ایران و جهان.', verified: true },

  { id: 'mehr', handle: 'mehr', name: 'مهر', full: 'خبرگزاری مهر',
    feeds: ['https://www.mehrnews.com/rss'], site: 'https://www.mehrnews.com',
    cat: 'رسمی', color: '#ef4444', bio: 'خبرگزاری مهر؛ اخبار ایران، اقتصاد و فرهنگ.', verified: true },

  { id: 'isna', handle: 'isna', name: 'ایسنا', full: 'خبرگزاری دانشجویان ایران (ایسنا)',
    feeds: ['https://www.isna.ir/rss'], site: 'https://www.isna.ir',
    cat: 'رسمی', color: '#06b6d4', bio: 'ایسنا؛ دانشگاهی، علمی و اجتماعی.', verified: false },

  { id: 'tasnim', handle: 'tasnim', name: 'تسنیم', full: 'خبرگزاری تسنیم',
    feeds: ['https://www.tasnimnews.com/fa/rss'], site: 'https://www.tasnimnews.com',
    cat: 'رسمی', color: '#f97316', bio: 'تسنیم؛ سیاسی، اقتصادی و بین‌الملل.', verified: false },

  { id: 'fars', handle: 'fars', name: 'فارس', full: 'خبرگزاری فارس',
    feeds: ['https://www.farsnews.ir/rss'], site: 'https://www.farsnews.ir',
    cat: 'رسمی', color: '#a855f7', bio: 'فارس؛ پوشش گستردهٔ اخبار داخلی.', verified: false },

  { id: 'khabaronline', handle: 'khabaronline', name: 'خبرآنلاین', full: 'خبرآنلاین',
    feeds: ['https://www.khabaronline.ir/rss'], site: 'https://www.khabaronline.ir',
    cat: 'تحلیلی', color: '#eab308', bio: 'خبرآنلاین؛ تحلیل و گفت‌وگو.', verified: true },

  { id: 'entekhab', handle: 'entekhab', name: 'انتخاب', full: 'پایگاه خبری انتخاب',
    feeds: ['https://www.entekhab.ir/fa/rss/all'], site: 'https://www.entekhab.ir',
    cat: 'تحلیلی', color: '#84cc16', bio: 'انتخاب؛ سیاست و جامعه.', verified: false },

  { id: 'eghtesadnews', handle: 'eghtesadnews', name: 'اقتصادنیوز', full: 'اقتصادنیوز',
    feeds: ['https://www.eghtesadnews.com/rss', 'https://www.eghtesadnews.com/feed'], site: 'https://www.eghtesadnews.com',
    cat: 'اقتصاد', color: '#10b981', bio: 'اقتصادنیوز؛ بورس، ارز، طلا و مسکن.', verified: false },

  { id: 'tejaratnews', handle: 'tejaratnews', name: 'تجارت‌نیوز', full: 'تجارت‌نیوز',
    feeds: ['https://www.tejaratnews.com/feed', 'https://www.tejaratnews.com/rss'], site: 'https://www.tejaratnews.com',
    cat: 'اقتصاد', color: '#0ea5e9', bio: 'تجارت‌نیوز؛ بازار، خودرو و ارز دیجیتال.', verified: false },

  { id: 'shana', handle: 'shana', name: 'شانا', full: 'خبرگزاری نفت و گاز (شانا)',
    feeds: ['https://www.shana.ir/rss'], site: 'https://www.shana.ir',
    cat: 'انرژی', color: '#14b8a6', bio: 'شانا؛ نفت، گاز، پتروشیمی و پالایش.', verified: false },

  { id: 'zoomit', handle: 'zoomit', name: 'زومیت', full: 'زومیت',
    feeds: ['https://www.zoomit.ir/feed/'], site: 'https://www.zoomit.ir',
    cat: 'فناوری', color: '#6366f1', bio: 'زومیت؛ فناوری، گجت و بررسی تخصصی.', verified: true },

  { id: 'digiato', handle: 'digiato', name: 'دیجیاتو', full: 'دیجیاتو',
    feeds: ['https://digiato.com/feed'], site: 'https://digiato.com',
    cat: 'فناوری', color: '#8b5cf6', bio: 'دیجیاتو؛ دنیای دیجیتال و استارتاپ.', verified: false },

  { id: 'varzesh3', handle: 'varzesh3', name: 'ورزش سه', full: 'ورزش سه',
    feeds: ['https://www.varzesh3.com/rss', 'https://www.varzesh3.com/rss/all'], site: 'https://www.varzesh3.com',
    cat: 'ورزش', color: '#f43f5e', bio: 'ورزش سه؛ فوتبال ایران و جهان.', verified: false },

  { id: 'bbc', handle: 'bbcpersian', name: 'بی‌بی‌سی فارسی', full: 'بی‌بی‌سی فارسی',
    feeds: ['https://feeds.bbci.co.uk/persian/rss.xml'], site: 'https://www.bbc.com/persian',
    cat: 'بین‌الملل', color: '#dc2626', bio: 'بی‌بی‌سی فارسی؛ اخبار بین‌الملل.', verified: true },

  { id: 'euronews', handle: 'euronews_fa', name: 'یورونیوز', full: 'یورونیوز فارسی',
    feeds: ['https://per.euronews.com/rss'], site: 'https://per.euronews.com',
    cat: 'بین‌الملل', color: '#2563eb', bio: 'یورونیوز؛ نگاه اروپا به رویدادها.', verified: true },

  { id: 'dw', handle: 'dw_persian', name: 'دویچه‌وله', full: 'دویچه‌وله فارسی',
    feeds: ['https://rss.dw.com/xml/rss-fa-all'], site: 'https://www.dw.com/fa-ir',
    cat: 'بین‌الملل', color: '#0284c7', bio: 'دویچه‌وله فارسی؛ اخبار آلمان و جهان.', verified: false }
];

export const AGENCY_BY_ID = Object.fromEntries(AGENCIES.map((a) => [a.id, a]));

/** دسته‌بندی موضوعی + کلیدواژه‌ها برای تشخیص خودکار */
export const TOPICS = {
  'اقتصاد': ['اقتصاد', 'بورس', 'دلار', 'تورم', 'بانک', 'ارز', 'طلا', 'بازار', 'مالیات', 'سهام', 'سرمایه', 'بودجه', 'صادرات', 'واردات', 'ریال', 'تومان', 'مسکن', 'سکه', 'فرابورس', 'شاخص', 'گرانی', 'تولید', 'سود', 'قیمت'],
  'انرژی': ['نفت', 'گاز', 'پتروشیمی', 'پالایشگاه', 'بنزین', 'سوخت', 'برق', 'انرژی', 'اوپک', 'میعانات', 'پتروشیمی', 'اورانیوم', 'نیروگاه', 'گازوئیل', 'خام', 'برنت'],
  'سیاست': ['سیاس', 'دولت', 'مجلس', 'انتخابات', 'وزیر', 'رئیس جمهور', 'مذاکره', 'تحریم', 'دیپلمات', 'قانون', 'نماینده', 'قوه قضاییه', 'کابینه', 'برجام', 'سفارت', 'لایحه', 'استیضاح', 'شورای نگهبان'],
  'فناوری': ['فناوری', 'هوش مصنوعی', 'اینترنت', 'موبایل', 'گوشی', 'نرم افزار', 'استارتاپ', 'تکنولوژی', 'اپل', 'گوگل', 'سامسونگ', 'تسلا', 'متا', 'تلگرام', 'لپ تاپ', 'ربات', 'دیجیتال', 'سایبری', 'اپلیکیشن', 'تراشه', 'پردازنده', 'ماهواره', 'گجت'],
  'خودرو': ['خودرو', 'خودروساز', 'سایپا', 'ایران خودرو', 'پژو', 'پراید', 'کوییک', 'تیبا', 'دنا', 'تارا', 'شاهین', 'قیمت خودرو', 'واردات خودرو', 'مونتاژ', 'خودروی برقی', 'کارکرده'],
  'ورزش': ['ورزش', 'فوتبال', 'والیبال', 'تیم ملی', 'لیگ', 'المپیک', 'قهرمان', 'جام جهانی', 'پرسپولیس', 'استقلال', 'لیگ برتر', 'کشتی', 'بسکتبال', 'بازیکن', 'مربی', 'سرمربی', 'داور', 'گل', 'مدال', 'فدراسیون'],
  'سلامت': ['سلامت', 'بیماری', 'واکسن', 'پزشک', 'درمان', 'بهداشت', 'ویروس', 'بیمارستان', 'دارو', 'تغذیه', 'رژیم', 'جراحی', 'سرطان', 'قلب', 'دیابت', 'پزشکی', 'دارویی'],
  'ایران': ['ایران', 'تهران', 'استان', 'ایرانی', 'کشور', 'جمهوری اسلامی', 'شهر', 'استاندار', 'شهردار', 'بندر', 'فرودگاه', 'آزادراه', 'مترو', 'دانشگاه', 'فرهنگ', 'هنر', 'سینما', 'میراث', 'گردشگری'],
  'جهان': ['جهان', 'آمریکا', 'اروپا', 'چین', 'روسیه', 'سازمان ملل', 'جنگ', 'اسرائیل', 'غزه', 'اوکراین', 'بین الملل', 'ناتو', 'اتحادیه اروپا', 'قطعنامه', 'آتش بس', 'خاورمیانه', 'ارتش', 'موشک']
};

export const TOPIC_STYLE = {
  'اقتصاد': 'economy', 'انرژی': 'energy', 'سیاست': 'politics', 'فناوری': 'tech',
  'خودرو': 'car', 'ورزش': 'sports', 'سلامت': 'health', 'ایران': 'iran', 'جهان': 'world'
};

/**
 * دارایی‌های ثروتمندی (servatmandi.com).
 * کد = شناسهٔ Entity در آدرس /Entity/Summary/{code}
 * unit: rial → مقدار به ریال است و به تومان تبدیل می‌شود. usd → دلاری.
 */
export const PRICE_ENTITIES = [
  // ── ارز ─────────────────────────────────────────────
  { key: 'usd', code: '100000000001', name: 'دلار آمریکا', short: 'USD', group: 'fx', unit: 'rial', icon: '$', featured: true },
  { key: 'eur', code: '100000000002', name: 'یورو', short: 'EUR', group: 'fx', unit: 'rial', icon: '€', featured: true },
  { key: 'gbp', code: '100000000008', name: 'پوند انگلیس', short: 'GBP', group: 'fx', unit: 'rial', icon: '£' },
  { key: 'aed', code: '100000000005', name: 'درهم امارات', short: 'AED', group: 'fx', unit: 'rial', icon: 'د.إ' },
  { key: 'try', code: '100000000006', name: 'لیر ترکیه', short: 'TRY', group: 'fx', unit: 'rial', icon: '₺' },
  { key: 'cny', code: '100000000007', name: 'یوان چین', short: 'CNY', group: 'fx', unit: 'rial', icon: '¥' },
  { key: 'chf', code: '100000000012', name: 'فرانک سوئیس', short: 'CHF', group: 'fx', unit: 'rial', icon: '₣' },
  { key: 'jpy', code: '100000000016', name: '۱۰۰ ین ژاپن', short: 'JPY', group: 'fx', unit: 'rial', icon: '¥' },
  { key: 'cad', code: '100000000009', name: 'دلار کانادا', short: 'CAD', group: 'fx', unit: 'rial', icon: 'C$' },
  { key: 'aud', code: '100000000010', name: 'دلار استرالیا', short: 'AUD', group: 'fx', unit: 'rial', icon: 'A$' },
  { key: 'rub', code: '100000000003', name: 'روبل روسیه', short: 'RUB', group: 'fx', unit: 'rial', icon: '₽' },
  { key: 'iqd', code: '100000000004', name: '۱۰۰ دینار عراق', short: 'IQD', group: 'fx', unit: 'rial', icon: 'ع.د' },
  { key: 'sar', code: '100000000026', name: 'ریال عربستان', short: 'SAR', group: 'fx', unit: 'rial', icon: '﷼' },
  { key: 'qar', code: '100000000025', name: 'ریال قطر', short: 'QAR', group: 'fx', unit: 'rial', icon: '﷼' },
  { key: 'kwd', code: '100000000023', name: 'دینار کویت', short: 'KWD', group: 'fx', unit: 'rial', icon: 'د.ك' },
  { key: 'afn', code: '100000000027', name: 'افغانی افغانستان', short: 'AFN', group: 'fx', unit: 'rial', icon: '؋' },
  { key: 'azn', code: '100000000029', name: 'منات آذربایجان', short: 'AZN', group: 'fx', unit: 'rial', icon: '₼' },
  { key: 'usd_gov', code: '200000000001', name: 'دلار حواله دولتی', short: 'USD-GOV', group: 'fx', unit: 'rial', icon: '$' },
  { key: 'usd_index', code: '800000', name: 'شاخص دلار ثروتمندی', short: 'SMD-USD', group: 'index', unit: 'raw', icon: '📈' },

  // ── طلا و سکه ────────────────────────────────────────
  { key: 'gold18', code: '5000000001102', name: 'طلای ۱۸ عیار', short: '۱ گرم', group: 'gold', unit: 'rial', icon: '🪙', featured: true },
  { key: 'mesghal', code: '5000000001000', name: 'مظنه طلا', short: 'مثقال', group: 'gold', unit: 'rial', icon: '⚖️', featured: true },
  { key: 'sekeh_emami', code: '5000000001202', name: 'سکه امامی', short: 'تمام', group: 'coin', unit: 'rial', icon: '🥇', featured: true },
  { key: 'gold_ounce', code: '10000000001901', name: 'انس طلا', short: 'XAU', group: 'gold', unit: 'usd', icon: '🌍', featured: true },
  { key: 'silver_ounce', code: '10000000001903', name: 'انس نقره', short: 'XAG', group: 'gold', unit: 'usd', icon: '🥈' },
  { key: 'silver999', code: '50000000001301', name: 'نقره ۹۹۹', short: '۱ گرم', group: 'gold', unit: 'rial', icon: '🥈' },

  // ── نفت، گاز و انرژی ─────────────────────────────────
  { key: 'brent', code: '10000000002001', name: 'نفت خام برنت', short: 'BRENT', group: 'energy', unit: 'usd', icon: '🛢️', featured: true },
  { key: 'wti', code: '10000000002000', name: 'نفت خام (WTI)', short: 'WTI', group: 'energy', unit: 'usd', icon: '🛢️', featured: true },
  { key: 'natgas', code: '10000000002002', name: 'گاز طبیعی', short: 'NG', group: 'energy', unit: 'usd', icon: '🔥', featured: true },
  { key: 'natgas_nl', code: '10000000002006', name: 'گاز طبیعی هلند (TTF)', short: 'TTF', group: 'energy', unit: 'usd', icon: '🔥' },
  { key: 'natgas_uk', code: '10000000002007', name: 'گاز طبیعی انگلستان', short: 'NBP', group: 'energy', unit: 'usd', icon: '🔥' },
  { key: 'natgas_de', code: '10000000002014', name: 'گاز طبیعی آلمان', short: 'DE-GAS', group: 'energy', unit: 'usd', icon: '🔥' },
  { key: 'lng_jk', code: '10000000002016', name: 'گاز مایع (ژاپن/کره)', short: 'LNG', group: 'energy', unit: 'usd', icon: '❄️' },
  { key: 'gasoline', code: '10000000002003', name: 'بنزین', short: 'GASOLINE', group: 'energy', unit: 'usd', icon: '⛽' },
  { key: 'fueloil', code: '10000000002004', name: 'نفت کوره', short: 'FUEL OIL', group: 'energy', unit: 'usd', icon: '🛢️' },
  { key: 'diesel', code: '10000000002009', name: 'سوخت (گازوئیل)', short: 'DIESEL', group: 'energy', unit: 'usd', icon: '⛽' },
  { key: 'propane', code: '10000000002010', name: 'پروپان', short: 'PROPANE', group: 'energy', unit: 'usd', icon: '🔥' },
  { key: 'coal', code: '10000000002005', name: 'زغال سنگ', short: 'COAL', group: 'energy', unit: 'usd', icon: '⚫' },
  { key: 'coke', code: '10000000002015', name: 'زغال کک', short: 'COKE', group: 'energy', unit: 'usd', icon: '⚫' },
  { key: 'uranium', code: '10000000002011', name: 'اورانیوم', short: 'U3O8', group: 'energy', unit: 'usd', icon: '☢️' },
  { key: 'ethanol', code: '10000000002008', name: 'اتانول', short: 'ETHANOL', group: 'energy', unit: 'usd', icon: '🌽' },
  { key: 'methanol', code: '10000000002012', name: 'متانول', short: 'METHANOL', group: 'energy', unit: 'usd', icon: '🧪' },
  { key: 'ural', code: '10000000002013', name: 'نفت اورال', short: 'URAL', group: 'energy', unit: 'usd', icon: '🛢️' },

  // ── ارز دیجیتال ─────────────────────────────────────
  { key: 'usdt', code: '5000000000000', name: 'تتر', short: 'USDT', group: 'crypto', unit: 'rial', icon: '₮', featured: true },
  { key: 'btc', code: '920000', name: 'بیت‌کوین', short: 'BTC', group: 'crypto', unit: 'usd', icon: '₿', featured: true },
  { key: 'eth', code: '920001', name: 'اتریوم', short: 'ETH', group: 'crypto', unit: 'usd', icon: 'Ξ' },
  { key: 'paxg', code: '910001', name: 'پکس گلد', short: 'PAXG', group: 'crypto', unit: 'usd', icon: '🪙' },
  { key: 'xaut', code: '910000', name: 'تتر گلد', short: 'XAUT', group: 'crypto', unit: 'usd', icon: '🪙' }
];

export const ENTITY_BY_KEY = Object.fromEntries(PRICE_ENTITIES.map((e) => [e.key, e]));
export const ENTITY_BY_CODE = Object.fromEntries(PRICE_ENTITIES.map((e) => [e.code, e]));

/** دسته‌های دیدبان ثروتمندی که برای کشف خودکار دارایی‌های جدید پیمایش می‌شوند */
export const SERVATMANDI = {
  base: 'https://servatmandi.com',
  name: 'ثروتمندی',
  site: 'https://servatmandi.com',
  categories: [
    { id: 1, key: 'fx', label: 'ارزها' },
    { id: 2, key: 'gold', label: 'طلا، سکه و فلزات گران‌بها' },
    { id: 3, key: 'energy', label: 'نفت و انرژی' },
    { id: 4, key: 'metal', label: 'فلزات پایه' },
    { id: 5, key: 'material', label: 'مواد صنعتی' },
    { id: 6, key: 'crypto', label: 'ارزهای دیجیتال' }
  ]
};

/** منبع قیمت خودرو */
export const CAR_SOURCES = [
  { id: 'bama', name: 'باما', site: 'https://bama.ir',
    pages: ['https://bama.ir/price', 'https://bama.ir/car'] },
  { id: 'bama_brand', name: 'باما (برندها)', site: 'https://bama.ir',
    pages: ['https://bama.ir/car/pride', 'https://bama.ir/car/peugeot', 'https://bama.ir/car/samand',
      'https://bama.ir/car/dena', 'https://bama.ir/car/quick', 'https://bama.ir/car/tara'] }
];

/** برچسب گروه‌های قیمت برای فیلتر */
export const PRICE_GROUPS = [
  { id: 'all', label: 'همه' },
  { id: 'fx', label: 'ارز' },
  { id: 'gold', label: 'طلا و سکه' },
  { id: 'coin', label: 'سکه' },
  { id: 'energy', label: 'نفت، گاز و انرژی' },
  { id: 'crypto', label: 'ارز دیجیتال' },
  { id: 'index', label: 'شاخص' },
  { id: 'car', label: 'خودرو' }
];
