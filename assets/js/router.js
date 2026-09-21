/** روتر هش‌بنیاد - مسیرها را به {name, params, query} تبدیل می‌کند */

export const ROUTE_NAMES = ['home', 'post', 'agency', 'price', 'prices', 'search', 'reels', 'archive', 'settings', 'me', 'activity', 'inbox'];

export function parseHash(hash = (typeof location !== 'undefined' ? location.hash : '')) {
  const raw = String(hash || '').replace(/^#\/?/, '');
  const [pathPart, queryPart = ''] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean).map(decodeURIComponent);
  const query = Object.fromEntries(new URLSearchParams(queryPart));

  if (!parts.length) return { name: 'home', params: {}, query };
  switch (parts[0]) {
    case 'p': return { name: 'post', params: { id: parts[1] }, query };
    case 'u': return { name: 'agency', params: { handle: parts[1] }, query };
    case 'price': return { name: 'price', params: { key: parts[1] }, query };
    case 'prices': return { name: 'prices', params: {}, query };
    case 'search': return { name: 'search', params: {}, query };
    case 'reels': return { name: 'reels', params: {}, query };
    case 'archive': return { name: 'archive', params: { day: parts[1] || '' }, query };
    case 'settings': return { name: 'settings', params: {}, query };
    case 'me': return { name: 'me', params: {}, query };
    case 'activity': return { name: 'activity', params: {}, query };
    case 'inbox': return { name: 'inbox', params: {}, query };
    default: return { name: 'home', params: {}, query };
  }
}

export function href(name, params = {}, query = {}) {
  const map = {
    home: [],
    post: ['p', params.id],
    agency: ['u', params.handle],
    price: ['price', params.key],
    prices: ['prices'],
    search: ['search'],
    reels: ['reels'],
    archive: ['archive', params.day],
    settings: ['settings'],
    me: ['me'],
    activity: ['activity'],
    inbox: ['inbox']
  };
  const path = (map[name] || []).filter(Boolean).map(encodeURIComponent).join('/');
  const q = new URLSearchParams(query).toString();
  return `#/${path}${q ? `?${q}` : ''}`;
}
