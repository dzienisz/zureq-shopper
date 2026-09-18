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
  if (result.structuredContent !== undefined) return result.structuredContent;
  const text = result.content?.find((item) => item.type === 'text')?.text;
  if (text) {
    try {
      const parsed = JSON.parse(text);
      if (result.isError || parsed?.error) throw new ZureqError('API_ERROR', parsed.error || 'Zureq returned an error.');
      return parsed;
    } catch {
      if (result.isError) throw new ZureqError('API_ERROR', text);
      return text;
    }
  }
  if (result.isError) throw new ZureqError('API_ERROR', 'Zureq returned an error.');
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

export { API_URL };
