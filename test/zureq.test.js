import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addSearchHistory, applyLiveDetails, callTool, checkoutSku, chunkLines, formatCredits, freshnessLabel, getCachedShopInfo,
  getShopInfo, locationArgs, mapApiError, normalizeMarkets, parseMaxPrice, parseToolResponse,
  isLowCredits, stockLabel, ZureqError
} from '../zureq.js';

const originalChrome = globalThis.chrome;
const originalFetch = globalThis.fetch;

test('formats credit counts with English thousands separators', () => {
  assert.equal(formatCredits(14893), '14,893');
  assert.equal(formatCredits('1000'), '1,000');
  assert.equal(formatCredits(null), '—');
  assert.equal(formatCredits(Number.NaN), '—');
});

test('applies a changed live price without mutating the search product', () => {
  const product = { price: 18.5, currency: 'PLN', inStock: false, name: 'Lamp' };
  const original = { ...product };
  const result = applyLiveDetails(product, { price: '21.25', currency: 'EUR', inStock: true });

  assert.deepEqual(result, {
    product: { ...product, price: 21.25, currency: 'EUR', inStock: true },
    previousPrice: 18.5
  });
  assert.deepEqual(product, original);
});

test('does not report a previous price when the live price is unchanged', () => {
  const product = { price: 18.5, currency: 'PLN', inStock: true };
  assert.deepEqual(applyLiveDetails(product, { price: '18.50' }), {
    product: { ...product, price: 18.5 },
    previousPrice: null
  });
});

test('leaves a search product unchanged when the live price is missing or nonnumeric', () => {
  const product = { price: 18.5, currency: 'PLN' };
  for (const details of [{}, { price: 'retail' }, { price: '' }, { price: null }]) {
    const result = applyLiveDetails(product, details);
    assert.equal(result.product, product);
    assert.equal(result.previousPrice, null);
  }
});

test('preserves currency when live details omit it and updates stock', () => {
  const product = { price: 18.5, currency: 'PLN', inStock: false };
  const result = applyLiveDetails(product, { price: 19, inStock: true });
  assert.equal(result.product.currency, 'PLN');
  assert.equal(result.product.inStock, true);
});

test('flags balances below five percent of included credits', () => {
  assert.equal(isLowCredits(24, 500), true);
  assert.equal(isLowCredits(25, 500), false);
  assert.equal(isLowCredits(0, 0), false);
  assert.equal(isLowCredits(null, 500), false);
});

test('maps country codes and regions to search location arguments', () => {
  assert.deepEqual(locationArgs(''), {});
  assert.deepEqual(locationArgs('EU'), { region: 'EU' });
  assert.deepEqual(locationArgs('eu'), { region: 'EU' });
  assert.deepEqual(locationArgs('pl'), { country: 'PL' });
});

test('parses max price as empty, positive finite, or invalid', () => {
  assert.deepEqual(parseMaxPrice(''), { value: undefined });
  assert.deepEqual(parseMaxPrice('  '), { value: undefined });
  assert.deepEqual(parseMaxPrice('12.5'), { value: 12.5 });
  for (const raw of ['0', '-1', 'NaN', 'Infinity']) {
    assert.deepEqual(parseMaxPrice(raw), { error: 'Max price must be greater than 0.' });
  }
});

test('uses the selected variant SKU for checkout', () => {
  assert.equal(checkoutSku({ sku: 'parent', variantSku: 'child' }), 'child');
  assert.equal(checkoutSku({ sku: 'parent' }), 'parent');
});

test('prefers API-provided market labels', () => {
  assert.deepEqual(
    normalizeMarkets({ countries: [
      { country: 'PL', name: 'Poland API name', label: 'Poland API label', shops: 2648 },
      { country: 'DE', label: 'Germany API label', shops: 42 }
    ] }),
    [
      { code: 'PL', label: 'Poland API name', count: 2648 },
      { code: 'DE', label: 'Germany API label', count: 42 }
    ]
  );
});

test('maps known API errors to friendly codes and messages', () => {
  const error = mapApiError({ code: -32003, message: 'credits' });
  assert.equal(error.code, 'CREDITS_EXHAUSTED');
  assert.match(error.message, /credits/i);
  assert(error instanceof ZureqError);
});

test('maps invalid arguments', () => {
  assert.equal(mapApiError({ code: -32602 }).code, 'INVALID_ARGS');
});

test('parses structured content', () => {
  const data = { products: [{ name: 'Lamp' }] };
  assert.deepEqual(parseToolResponse({ result: { structuredContent: data } }), data);
});

test('parses JSON text fallback', () => {
  assert.deepEqual(parseToolResponse({ result: { content: [{ type: 'text', text: '{"count":2}' }] } }), { count: 2 });
});

test('returns non-JSON text fallback', () => {
  assert.equal(parseToolResponse({ result: { content: [{ type: 'text', text: 'done' }] } }), 'done');
});

test('calls the MCP endpoint with a key from fake Chrome storage', async () => {
  globalThis.chrome = { storage: { sync: { get: async () => ({ zureqApiKey: 'test-key' }) } } };
  let request;
  globalThis.fetch = async (_url, options) => {
    request = JSON.parse(options.body);
    return { json: async () => ({ result: { structuredContent: { remaining: 4 } } }) };
  };
  assert.deepEqual(await callTool('get_usage', {}), { remaining: 4 });
  assert.equal(request.params.name, 'get_usage');
  assert.equal(request.params.arguments.constructor, Object);
  delete globalThis.chrome;
  delete globalThis.fetch;
});

test('retries a temporarily unavailable API error once', async () => {
  globalThis.chrome = { storage: { sync: { get: async () => ({ zureqApiKey: 'test-key' }) } } };
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return {
      json: async () => (calls === 1
        ? { result: { isError: true, content: [{ type: 'text', text: 'Search is temporarily unavailable. Please retry.' }] } }
        : { result: { structuredContent: { products: [] } } })
    };
  };

  assert.deepEqual(await callTool('search_products', {}), { products: [] });
  assert.equal(calls, 2);
});

test('stops after two temporarily unavailable API errors', async () => {
  globalThis.chrome = { storage: { sync: { get: async () => ({ zureqApiKey: 'test-key' }) } } };
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return {
      json: async () => ({
        result: { isError: true, content: [{ type: 'text', text: 'Search is temporarily unavailable. Please retry.' }] }
      })
    };
  };

  await assert.rejects(
    callTool('search_products', {}),
    (error) => error.code === 'API_ERROR' && /temporarily unavailable/i.test(error.message)
  );
  assert.equal(calls, 2);
});

test('uses an API-key override without reading Chrome storage', async () => {
  let storageCalls = 0;
  let authorization;
  globalThis.chrome = {
    storage: {
      sync: {
        get: async () => { storageCalls += 1; },
        set: async () => { storageCalls += 1; }
      }
    }
  };
  globalThis.fetch = async (_url, options) => {
    authorization = options.headers.Authorization;
    return { json: async () => ({ result: { structuredContent: { remaining: 4 } } }) };
  };

  assert.deepEqual(await callTool('get_usage', {}, { apiKey: 'typed-test-key' }), { remaining: 4 });
  assert.equal(authorization, 'Bearer typed-test-key');
  assert.equal(storageCalls, 0);
});

test('surfaces error responses returned as tool text', () => {
  assert.throws(
    () => parseToolResponse({ result: { isError: true, content: [{ type: 'text', text: '{"error":"timed out"}' }] } }),
    (error) => error.code === 'API_ERROR' && error.message === 'timed out'
  );
});

test('surfaces object-valued API error messages', () => {
  const text = '{"error":{"message":"invalid market","code":-32602}}';
  assert.throws(
    () => parseToolResponse({ result: { isError: true, content: [{ type: 'text', text }] } }),
    (error) => error.code === 'API_ERROR' && error.message === 'invalid market'
  );
  const missingMessage = '{"error":{"code":-32602}}';
  assert.throws(
    () => parseToolResponse({ result: { isError: true, content: [{ type: 'text', text: missingMessage }] } }),
    (error) => error.code === 'API_ERROR' && error.message === missingMessage
  );
});

test('surfaces non-JSON error responses returned as tool text', () => {
  assert.throws(
    () => parseToolResponse({ result: { isError: true, content: [{ type: 'text', text: 'Service unavailable' }] } }),
    (error) => error.code === 'API_ERROR' && error.message === 'Service unavailable'
  );
});

test('persists the newest search history rather than the old array', async () => {
  let saved;
  globalThis.chrome = {
    storage: {
      local: {
        get: async () => ({ zureqHistory: ['old search', 'another search'] }),
        set: async (values) => { saved = values; }
      }
    }
  };
  assert.deepEqual(await addSearchHistory('new search'), ['new search', 'old search', 'another search']);
  assert.deepEqual(saved, { zureqHistory: ['new search', 'old search', 'another search'] });
  delete globalThis.chrome;
});

test('formats product stock labels', () => {
  assert.equal(stockLabel({ inStock: false, stockQty: 4 }), 'Out of stock');
  assert.equal(stockLabel({ inStock: true, stockQty: 99 }), 'Available');
  assert.equal(stockLabel({ inStock: true }), 'Available');
  assert.equal(stockLabel({ inStock: true, stockQty: 4 }), '4 in stock');
});

test('formats product freshness labels', () => {
  const syncedAt = '2026-01-01T00:00:00.000Z';
  const timestamp = Date.parse(syncedAt);
  assert.equal(freshnessLabel({ live: true, syncedAt }, timestamp), 'Live from shop');
  assert.equal(freshnessLabel({ live: false }, timestamp), '');
  assert.equal(freshnessLabel({ syncedAt }, timestamp + 59999), 'Updated just now');
  assert.equal(freshnessLabel({ syncedAt }, timestamp + 2 * 60000), 'Updated 2 min ago');
  assert.equal(freshnessLabel({ syncedAt }, timestamp + 4 * 60 * 60 * 1000), 'Updated 4 h ago');
  assert.equal(freshnessLabel({ syncedAt }, timestamp + 2 * 24 * 60 * 60 * 1000), 'Updated 2 d ago');
  assert.equal(freshnessLabel({ syncedAt: 'not-a-date' }, timestamp), '');
});

test('chunks lines by the requested maximum and defaults invalid limits to 20', () => {
  const lines = Array.from({ length: 21 }, (_, index) => index);
  assert.deepEqual(chunkLines(lines.slice(0, 5), 2), [[0, 1], [2, 3], [4]]);
  assert.deepEqual(chunkLines(lines, null).map((chunk) => chunk.length), [20, 1]);
  assert.deepEqual(chunkLines(lines, 'invalid').map((chunk) => chunk.length), [20, 1]);
  assert.deepEqual(chunkLines([], 2), []);
});

test('getShopInfo caches shop data and avoids a second tool call on a cache hit', async () => {
  let store = { zureqShops: {} };
  globalThis.chrome = {
    storage: {
      local: {
        get: async (defaults) => ({ ...defaults, ...store }),
        set: async (values) => { store = { ...store, ...values }; }
      }
    }
  };
  const info = {
    checkoutLinkSupported: true,
    checkoutLinkMaxLines: 20,
    live: true,
    website: 'https://shop.example',
    name: 'Example Shop'
  };
  let calls = 0;
  const callTool = async (name, args) => {
    calls += 1;
    assert.equal(name, 'get_shop');
    assert.deepEqual(args, { shopId: 'bizzle-pl' });
    return info;
  };

  const first = await getShopInfo(callTool, 'bizzle-pl');
  assert.deepEqual(first, { info, cached: false });
  assert.deepEqual(store.zureqShops['bizzle-pl'].info, info);
  assert.ok(Number.isFinite(store.zureqShops['bizzle-pl'].at));
  assert.deepEqual(await getCachedShopInfo('bizzle-pl'), info);

  const second = await getShopInfo(callTool, 'bizzle-pl');
  assert.deepEqual(second, { info, cached: true });
  assert.equal(calls, 1);
});

test('getShopInfo refreshes shop data after the 24-hour cache expires', async () => {
  const oldInfo = { name: 'Old shop info' };
  let store = {
    zureqShops: {
      'shop-a': { info: oldInfo, at: Date.now() - 24 * 60 * 60 * 1000 }
    }
  };
  globalThis.chrome = {
    storage: {
      local: {
        get: async (defaults) => ({ ...defaults, ...store }),
        set: async (values) => { store = { ...store, ...values }; }
      }
    }
  };
  const info = {
    checkoutLinkSupported: false,
    checkoutLinkMaxLines: null,
    live: false,
    website: 'https://new.example',
    name: 'New shop info'
  };
  let calls = 0;
  const result = await getShopInfo(async () => {
    calls += 1;
    return info;
  }, 'shop-a');
  assert.deepEqual(result, { info, cached: false });
  assert.equal(calls, 1);
  assert.deepEqual(store.zureqShops['shop-a'].info, info);
});

test.afterEach(() => {
  if (originalChrome === undefined) delete globalThis.chrome;
  else globalThis.chrome = originalChrome;
  if (originalFetch === undefined) delete globalThis.fetch;
  else globalThis.fetch = originalFetch;
});
