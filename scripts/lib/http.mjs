/** کلاینت HTTP ساده با timeout، retry و User-Agent مناسب */

export const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 RasadBot/2.0';

export async function fetchText(url, { timeout = 20000, retries = 2, headers = {}, fetchImpl } = {}) {
  const f = fetchImpl || globalThis.fetch;
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await f(url, {
        signal: ctrl.signal,
        redirect: 'follow',
        headers: { 'User-Agent': UA, 'Accept-Language': 'fa,en;q=0.8', Accept: '*/*', ...headers }
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      clearTimeout(timer);
      lastError = e;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
    }
  }
  throw new Error(`${url} → ${lastError?.name || 'error'}: ${lastError?.message || ''}`);
}

export async function fetchJson(url, opts) {
  const text = await fetchText(url, opts);
  try { return JSON.parse(text); } catch { return null; }
}
