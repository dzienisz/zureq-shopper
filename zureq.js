const API_URL = 'https://api.zureq.io/mcp';
let requestId = 0;

export const TOOL_COSTS = Object.freeze({
  search_products: 3,
  compare_markets: 6,
  get_product: 1,
  create_checkout_link: 1,
  get_shop: 1,
  list_shops: 1,
  list_categories: 1,
  list_markets: 0,
  get_usage: 0
});

export class ZureqError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ZureqError';
    this.code = code;
    this.details = details;
  }
}

const ERROR_MESSAGES = {
  '-32001': ['BAD_KEY', 'The API key was rejected. Check it in Options.'],
  '-32002': ['RATE_LIMIT', 'Zureq is rate limiting requests. Please try again shortly.'],
  '-32003': ['CREDITS_EXHAUSTED', 'Your monthly Zureq credits are exhausted.'],
  '-32602': ['INVALID_ARGS', 'The request was not accepted. Check the search fields.']
};

export function locationArgs(code) {
  const location = String(code || '').trim().toUpperCase();
  if (!location) return {};
  return location === 'EU' ? { region: 'EU' } : { country: location };
}

export function normalizeMarkets(data) {
  const list = data?.markets || data?.countries || data?.items || (Array.isArray(data) ? data : []);
  return list.map((item) => {
    const code = typeof item === 'string' ? item : item.code || item.isoCode || item.country || item.market || item.id;
    if (!code) return null;
    const normalizedCode = String(code).toUpperCase();
    let label = typeof item === 'string' ? '' : item.name || item.label;
    if (!label) {
      try {
        label = new Intl.DisplayNames(['en'], { type: 'region' }).of(normalizedCode);
      } catch {}
    }
    return {
      code: normalizedCode,
      label: label || normalizedCode,
      count: typeof item === 'string' ? undefined : item.count ?? item.shops
    };
  }).filter(Boolean);
}

export function stockLabel(details) {
  if (!details?.inStock) return 'Out of stock';
  if (details.stockQty == null || Number(details.stockQty) === 99) return 'Available';
  return `${details.stockQty} in stock`;
}

export function freshnessLabel(details, now = Date.now()) {
  if (details?.live) return 'Live from shop';
  if (!details?.syncedAt) return '';
  const syncedAt = new Date(details.syncedAt).getTime();
  const elapsed = Number(now) - syncedAt;
  if (!Number.isFinite(elapsed)) return '';
  const age = Math.max(0, elapsed);
  if (age < 60000) return 'Updated just now';
  const minutes = Math.floor(age / 60000);
  if (minutes < 60) return `Updated ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Updated ${hours} h ago`;
  return `Updated ${Math.floor(hours / 24)} d ago`;
}

export function chunkLines(lines, max) {
  const limit = Number(max);
  const size = max == null || !Number.isFinite(limit) || limit <= 0 ? 20 : Math.max(1, Math.floor(limit));
  const values = Array.isArray(lines) ? lines : [];
  const chunks = [];
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
  return chunks;
}

export function mapApiError(error) {
  const code = String(error?.code ?? 'UNKNOWN');
  const [friendlyCode, message] = ERROR_MESSAGES[code] || ['API_ERROR', error?.message || 'Zureq returned an unexpected error.'];
  return new ZureqError(friendlyCode, message, { apiCode: error?.code, data: error?.data });
}

export function parseToolResponse(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new ZureqError('PARSE_ERROR', 'Zureq returned an empty response.');
  }
  if (payload.error) throw mapApiError(payload.error);
  const result = payload.result;
  if (!result) throw new ZureqError('PARSE_ERROR', 'Zureq returned no result.');
  const structuredContent = result.structuredContent;
  const text = result.content?.find((item) => item.type === 'text')?.text;
  if (text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      if (result.isError) throw new ZureqError('API_ERROR', text);
      return structuredContent !== undefined ? structuredContent : text;
    }
    if (result.isError || parsed?.error) {
      const error = parsed?.error;
      const message = error && typeof error === 'object' ? error.message || text : error || text;
      throw new ZureqError('API_ERROR', message);
    }
    return structuredContent !== undefined ? structuredContent : parsed;
  }
  if (result.isError) throw new ZureqError('API_ERROR', 'Zureq returned an error.');
  if (structuredContent !== undefined) return structuredContent;
  return result;
}

async function getApiKey() {
  const values = await chrome.storage.sync.get({ zureqApiKey: '' });
  return String(values.zureqApiKey || '').trim();
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function callTool(name, args = {}, options = {}) {
  const key = await getApiKey();
  if (!key) throw new ZureqError('NO_KEY', 'Add your Zureq API key in Options to get started.');
  const maxAttempts = options.retryRateLimit === false ? 1 : 2;
  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt += 1;
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: ++requestId,
        method: 'tools/call',
        params: { name, arguments: args }
      })
    });
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new ZureqError('NETWORK_ERROR', 'Zureq returned an unreadable response.');
    }
    try {
      return parseToolResponse(payload);
    } catch (error) {
      if (error.code === 'RATE_LIMIT' && attempt < maxAttempts) {
        await delay(2000);
        continue;
      }
      throw error;
    }
  }
  throw new ZureqError('RATE_LIMIT', 'Zureq is rate limiting requests. Please try again shortly.');
}

export async function addSearchHistory(query) {
  const clean = String(query || '').trim();
  if (!clean) return [];
  const { zureqHistory = [] } = await chrome.storage.local.get({ zureqHistory: [] });
  const history = [clean, ...zureqHistory.filter((item) => item.toLowerCase() !== clean.toLowerCase())].slice(0, 20);
  await chrome.storage.local.set({ zureqHistory: history });
  return history;
}

export async function getSearchHistory() {
  const { zureqHistory = [] } = await chrome.storage.local.get({ zureqHistory: [] });
  return Array.isArray(zureqHistory) ? zureqHistory.slice(0, 20) : [];
}

export async function getCachedMarkets() {
  const { zureqMarketsCache } = await chrome.storage.local.get({ zureqMarketsCache: null });
  if (!zureqMarketsCache || Date.now() - zureqMarketsCache.savedAt > 86400000) return null;
  return zureqMarketsCache.data;
}

export async function cacheMarkets(data) {
  await chrome.storage.local.set({ zureqMarketsCache: { savedAt: Date.now(), data } });
}

const SHOP_CACHE_TTL = 24 * 60 * 60 * 1000;

async function getShopCache() {
  const { zureqShops = {} } = await chrome.storage.local.get({ zureqShops: {} });
  return zureqShops && typeof zureqShops === 'object' && !Array.isArray(zureqShops) ? zureqShops : {};
}

function freshShopInfo(entry, now = Date.now()) {
  return entry?.info && now - Number(entry.at) < SHOP_CACHE_TTL ? entry.info : null;
}

export async function getCachedShopInfo(shopId) {
  const cache = await getShopCache();
  return freshShopInfo(cache[String(shopId)]);
}

export async function getShopInfo(callTool, shopId) {
  const id = String(shopId);
  const cache = await getShopCache();
  const cachedInfo = freshShopInfo(cache[id]);
  if (cachedInfo) return { info: cachedInfo, cached: true };

  const data = await callTool('get_shop', { shopId: id });
  const info = {
    checkoutLinkSupported: data?.checkoutLinkSupported,
    checkoutLinkMaxLines: data?.checkoutLinkMaxLines,
    live: data?.live,
    website: data?.website,
    name: data?.name
  };
  await chrome.storage.local.set({
    zureqShops: { ...cache, [id]: { info, at: Date.now() } }
  });
  return { info, cached: false };
}

export { API_URL };
