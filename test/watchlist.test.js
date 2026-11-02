import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addWatch, applyResult, checkWatchlist, clearAlerts, evaluateWatch, getWatches, searchBaseline, setWatchTarget
} from '../watchlist.js';
import { ZureqError } from '../zureq.js';

function storageHarness(initial = []) {
  let value = initial;
  globalThis.chrome = {
    storage: {
      local: {
        get: async () => ({ zureqWatchlist: value }),
        set: async (values) => { value = values.zureqWatchlist; }
      }
    }
  };
  return () => {
    delete globalThis.chrome;
    return value;
  };
}

test('searchBaseline uses the majority currency before choosing its lowest price', () => {
  assert.deepEqual(searchBaseline([
    { price: 3, currency: 'EUR' },
    { price: 100, currency: 'PLN' },
    { price: 80, currency: 'PLN' },
    { price: 90, currency: 'PLN' }
  ]), { price: 80, currency: 'PLN' });
});

test('searchBaseline breaks currency-count ties by first result order', () => {
  assert.deepEqual(searchBaseline([
    { price: 40, currency: 'EUR' },
    { price: 1, currency: 'PLN' }
  ]), { price: 40, currency: 'EUR' });
});

test('searchBaseline returns null without finite priced products and currencies', () => {
  assert.equal(searchBaseline([]), null);
  assert.equal(searchBaseline([
    { price: Number.POSITIVE_INFINITY, currency: 'PLN' },
    { price: '', currency: 'EUR' },
    { price: 10, currency: '' }
  ]), null);
});

test('addWatch normalizes target prices to finite positive values', async () => {
  const cleanup = storageHarness([]);
  const makeWatch = (query, targetPrice) => addWatch({
    type: 'query',
    query,
    baseline: { price: 100, currency: 'PLN' },
    targetPrice
  });
  assert.equal((await makeWatch('valid', 80)).targetPrice, 80);
  assert.equal((await makeWatch('valid-target-hit', 80)).targetHit, false);
  assert.equal((await makeWatch('zero', 0)).targetPrice, null);
  assert.equal((await makeWatch('negative', -1)).targetPrice, null);
  assert.equal((await makeWatch('infinite', Number.POSITIVE_INFINITY)).targetPrice, null);
  assert.equal((await makeWatch('garbage', 'not-a-price')).targetPrice, null);
  const defaults = await makeWatch('defaults', null);
  assert.equal(defaults.lastInStock, null);
  assert.equal(defaults.unavailable, false);
  cleanup();
});

test('evaluateWatch filters products, currency, and picks the cheapest', () => {
  const watch = {
    type: 'product',
    shopId: 'shop-a',
    sku: 'sku-1',
    baseline: { price: 100, currency: 'PLN' }
  };
  const result = evaluateWatch(watch, [
    { shopId: 'shop-a', sku: 'sku-1', price: 95, currency: 'PLN' },
    { shopId: 'shop-a', sku: 'sku-1', price: 80, currency: 'EUR' },
    { shopId: 'shop-b', sku: 'sku-1', price: 40, currency: 'PLN' },
    { shopId: 'shop-a', sku: 'other', price: 50, currency: 'PLN' },
    { shopId: 'shop-a', sku: 'sku-1', price: 'not-a-price', currency: 'PLN' }
  ]);
  assert.equal(result.best.price, 95);
  assert.equal(result.cheaper, true);
  assert.equal(result.hitTarget, false);
  assert.equal(applyResult(watch, result).alert, true);
  assert.equal(evaluateWatch(watch, []).best, null);
});

test('evaluateWatch reports no alert when the best price is not cheaper', () => {
  const result = evaluateWatch(
    { type: 'query', baseline: { price: 100, currency: 'PLN' } },
    [{ price: 100, currency: 'PLN' }, { price: 120, currency: 'PLN' }]
  );
  assert.equal(result.best.price, 100);
  assert.equal(result.cheaper, false);
});

test('target alerts require a price at or below the target, not merely below baseline', () => {
  const watch = {
    type: 'query',
    baseline: { price: 100, currency: 'PLN' },
    targetPrice: 90
  };
  const aboveTarget = evaluateWatch(watch, [{ price: 95, currency: 'PLN' }]);
  assert.equal(aboveTarget.cheaper, true);
  assert.equal(aboveTarget.hitTarget, false);
  assert.equal(applyResult(watch, aboveTarget).targetHit, false);
  assert.equal(applyResult(watch, aboveTarget).alert, false);

  for (const price of [90, 85]) {
    const atOrBelowTarget = evaluateWatch(watch, [{ price, currency: 'PLN' }]);
    assert.equal(atOrBelowTarget.hitTarget, true);
    const result = applyResult(watch, atOrBelowTarget);
    assert.equal(result.targetHit, true);
    assert.equal(result.alert, true);
  }
});

test('applyResult is immutable and records an alert', () => {
  const watch = {
    id: 'watch-1',
    baseline: { price: 100, currency: 'PLN' },
    lastPrice: null,
    lastResult: null,
    alert: false
  };
  const result = applyResult(watch, {
    best: { name: 'Lamp', price: 80, currency: 'PLN', shopName: 'Shop' },
    cheaper: true
  }, 123);
  assert.equal(watch.lastCheckedAt, undefined);
  assert.equal(watch.alert, false);
  assert.equal(result.lastCheckedAt, 123);
  assert.equal(result.lastPrice, 80);
  assert.equal(result.lastResult.name, 'Lamp');
  assert.equal(result.targetHit, false);
  assert.equal(result.alert, true);
});

test('addWatch deduplicates and caps at 25 entries', async () => {
  const cleanup = storageHarness([]);
  for (let index = 0; index < 26; index += 1) {
    await addWatch({
      type: 'query',
      query: `query-${index}`,
      baseline: { price: index + 1, currency: 'PLN' },
      createdAt: index + 1
    });
  }
  let watches = await getWatches();
  assert.equal(watches.length, 25);
  assert.equal(watches.some((watch) => watch.query === 'query-0'), false);
  await addWatch({
    type: 'query',
    query: 'query-25',
    baseline: { price: 999, currency: 'PLN' },
    createdAt: 30
  });
  watches = await getWatches();
  assert.equal(watches.length, 25);
  assert.equal(watches.find((watch) => watch.query === 'query-25').baseline.price, 999);
  cleanup();
});

test('setWatchTarget sets or clears a target and resets the alert', async () => {
  const cleanup = storageHarness([
    { id: 'watch-target', name: 'Lamp', alert: true, targetPrice: 90, targetHit: true }
  ]);
  await setWatchTarget('watch-target', 80);
  let watch = (await getWatches())[0];
  assert.equal(watch.targetPrice, 80);
  assert.equal(watch.alert, false);
  assert.equal(watch.targetHit, false);
  await setWatchTarget('watch-target', null);
  watch = (await getWatches())[0];
  assert.equal(watch.targetPrice, null);
  assert.equal(watch.alert, false);
  assert.equal(watch.targetHit, false);
  cleanup();
});

test('checkWatchlist notifies newly cheaper watches', async () => {
  const initial = [
    { id: 'watch-1', type: 'query', query: 'lamp', country: '', name: 'Lamp', baseline: { price: 100, currency: 'PLN' }, alert: false, lastCheckedAt: null },
    { id: 'watch-2', type: 'query', query: 'desk', country: '', name: 'Desk', baseline: { price: 50, currency: 'PLN' }, alert: true, lastCheckedAt: null }
  ];
  const cleanup = storageHarness(initial);
  const notifications = [];
  const result = await checkWatchlist(
    async (_name, args) => ({ products: [{ name: args.query, price: args.query === 'lamp' ? 80 : 60, currency: 'PLN' }] }),
    { notify: (watch) => notifications.push(watch.id), setBadge: (count) => { assert.equal(count, 1); } }
  );
  assert.equal(result.checked, 2);
  assert.equal(result.alerts, 1);
  assert.deepEqual(notifications, ['watch-1']);
  cleanup();
});

test('checkWatchlist alerts on target-hit transitions and rearms after the target is left', async () => {
  const cleanup = storageHarness([
    {
      id: 'watch-target',
      type: 'query',
      query: 'lamp',
      country: 'PL',
      name: 'Lamp',
      baseline: { price: 41.08, currency: 'PLN' },
      targetPrice: null,
      targetHit: false,
      alert: false,
      lastPrice: 41.08
    }
  ]);
  const notifications = [];
  let price = 41.08;
  await setWatchTarget('watch-target', 42.08);
  const check = () => checkWatchlist(
    async () => ({ products: [{ name: 'Lamp', price, currency: 'PLN' }] }),
    { notify: (watch) => notifications.push(watch.id) }
  );

  const first = await check();
  assert.equal(first.alerts, 1);
  assert.deepEqual(notifications, ['watch-target']);
  let watch = (await getWatches())[0];
  assert.equal(watch.lastPrice, 41.08);
  assert.equal(watch.targetHit, true);
  assert.equal(watch.alert, true);

  const second = await check();
  assert.equal(second.alerts, 1);
  assert.deepEqual(notifications, ['watch-target']);

  await clearAlerts();
  const afterClear = await check();
  assert.equal(afterClear.alerts, 0);
  assert.deepEqual(notifications, ['watch-target']);
  watch = (await getWatches())[0];
  assert.equal(watch.targetHit, true);
  assert.equal(watch.alert, false);

  price = 42.09;
  const aboveTarget = await check();
  assert.equal(aboveTarget.alerts, 0);
  watch = (await getWatches())[0];
  assert.equal(watch.targetHit, false);
  assert.equal(watch.alert, false);

  price = 41.08;
  const backUnderTarget = await check();
  assert.equal(backUnderTarget.alerts, 1);
  assert.deepEqual(notifications, ['watch-target', 'watch-target']);
  watch = (await getWatches())[0];
  assert.equal(watch.targetHit, true);
  assert.equal(watch.alert, true);
  cleanup();
});

test('product watches fetch the live product by shopId and sku', async () => {
  const cleanup = storageHarness([
    {
      id: 'product-watch',
      type: 'product',
      query: 'lamp',
      country: 'PL',
      shopId: 'shop-a',
      sku: 'sku-1',
      name: 'Lamp',
      baseline: { price: 100, currency: 'PLN' },
      lastInStock: true,
      alert: false
    }
  ]);
  let request;
  const result = await checkWatchlist(async (name, args) => {
    request = { name, args };
    return {
      product: {
        shopId: 'shop-a',
        sku: 'sku-1',
        name: 'Lamp',
        shopName: 'Shop A',
        price: '95',
        currency: 'PLN',
        inStock: true
      }
    };
  });
  assert.deepEqual(request, { name: 'get_product', args: { shopId: 'shop-a', sku: 'sku-1' } });
  assert.equal(result.checked, 1);
  const watch = (await getWatches())[0];
  assert.equal(watch.lastInStock, true);
  assert.equal(watch.lastPrice, 95);
  assert.equal(watch.unavailable, false);
  cleanup();
});

test('product watches alert once on a restock transition', async () => {
  const cleanup = storageHarness([
    {
      id: 'restock-watch',
      type: 'product',
      query: 'lamp',
      country: 'PL',
      shopId: 'shop-a',
      sku: 'sku-1',
      name: 'Lamp',
      baseline: { price: 100, currency: 'PLN' },
      lastPrice: 90,
      lastCurrency: 'PLN',
      lastInStock: true,
      alert: false
    }
  ]);
  const notifications = [];
  let inStock = false;
  const check = () => checkWatchlist(
    async () => ({
      product: {
        shopId: 'shop-a',
        sku: 'sku-1',
        name: 'Lamp',
        shopName: 'Shop A',
        price: 80,
        currency: 'PLN',
        inStock
      }
    }),
    { notify: (watch) => notifications.push({ id: watch.id, reason: watch.alertReason }) }
  );

  const outOfStock = await check();
  assert.equal(outOfStock.alerts, 0);
  assert.deepEqual(notifications, []);
  assert.equal((await getWatches())[0].lastInStock, false);

  inStock = true;
  const restocked = await check();
  assert.equal(restocked.alerts, 1);
  assert.deepEqual(notifications, [{ id: 'restock-watch', reason: 'restock' }]);
  let watch = (await getWatches())[0];
  assert.equal(watch.alertReason, 'restock');
  assert.equal(watch.lastInStock, true);

  await check();
  watch = (await getWatches())[0];
  assert.deepEqual(notifications, [{ id: 'restock-watch', reason: 'restock' }]);
  assert.equal(watch.alertReason, 'restock');
  cleanup();
});

test('an out-of-stock product price drop does not alert', async () => {
  const cleanup = storageHarness([
    {
      id: 'out-of-stock-watch',
      type: 'product',
      query: 'lamp',
      country: 'PL',
      shopId: 'shop-a',
      sku: 'sku-1',
      name: 'Lamp',
      baseline: { price: 100, currency: 'PLN' },
      lastPrice: 100,
      lastInStock: true,
      alert: false
    }
  ]);
  const notifications = [];
  const result = await checkWatchlist(
    async () => ({
      price: 80,
      currency: 'PLN',
      inStock: false,
      shopId: 'shop-a',
      sku: 'sku-1',
      name: 'Lamp'
    }),
    { notify: (watch) => notifications.push(watch.id) }
  );
  assert.equal(result.alerts, 0);
  assert.deepEqual(notifications, []);
  const watch = (await getWatches())[0];
  assert.equal(watch.lastInStock, false);
  assert.equal(watch.lastPrice, 80);
  assert.equal(watch.alert, false);
  assert.equal(watch.alertReason, null);
  cleanup();
});

test('a missing product SKU marks its watch unavailable and continues', async () => {
  const cleanup = storageHarness([
    {
      id: 'missing-watch',
      type: 'product',
      query: 'lamp',
      country: 'PL',
      shopId: 'shop-a',
      sku: 'missing',
      name: 'Lamp',
      baseline: { price: 100, currency: 'PLN' },
      lastInStock: false,
      alert: false
    },
    {
      id: 'query-watch',
      type: 'query',
      query: 'desk',
      country: 'PL',
      name: 'Desk',
      baseline: { price: 100, currency: 'PLN' },
      alert: false
    }
  ]);
  const calls = [];
  const notifications = [];
  const result = await checkWatchlist(async (name, args) => {
    calls.push({ name, args });
    if (name === 'get_product') {
      throw new ZureqError('API_ERROR', 'Shop shop-a has no product with sku missing');
    }
    return { products: [{ name: 'Desk', price: 80, currency: 'PLN' }] };
  }, { notify: (watch) => notifications.push(watch.id) });

  assert.equal(result.checked, 2);
  assert.deepEqual(calls.map((call) => call.name), ['get_product', 'search_products']);
  const watches = await getWatches();
  assert.equal(watches.find((watch) => watch.id === 'missing-watch').unavailable, true);
  assert.equal(watches.find((watch) => watch.id === 'missing-watch').alert, false);
  assert.equal(watches.find((watch) => watch.id === 'query-watch').alert, true);
  assert.deepEqual(notifications, ['query-watch']);
  cleanup();
});

test('checkWatchlist sends EU watches as a region filter', async () => {
  const cleanup = storageHarness([
    { id: 'watch-eu', type: 'query', query: 'lamp', country: 'EU', name: 'Lamp', baseline: { price: 100, currency: 'PLN' }, alert: false, lastCheckedAt: null }
  ]);
  let request;
  await checkWatchlist(async (name, args) => {
    request = { name, args };
    return { products: [] };
  });
  assert.deepEqual(request, {
    name: 'search_products',
    args: { query: 'lamp', region: 'EU', inStockOnly: true, limit: 10 }
  });
  cleanup();
});

test('checkWatchlist does not re-alert a seen price unless it drops further', async () => {
  const initial = [
    { id: 'watch-1', type: 'query', query: 'lamp', country: '', name: 'Lamp', baseline: { price: 100, currency: 'PLN' }, alert: false, lastPrice: 80, lastCheckedAt: 1 },
    { id: 'watch-2', type: 'query', query: 'desk', country: '', name: 'Desk', baseline: { price: 100, currency: 'PLN' }, alert: false, lastPrice: 80, lastCheckedAt: 1 }
  ];
  const cleanup = storageHarness(initial);
  const notifications = [];
  const result = await checkWatchlist(
    async (_name, args) => ({ products: [{ name: args.query, price: args.query === 'lamp' ? 80 : 70, currency: 'PLN' }] }),
    { notify: (watch) => notifications.push(watch.id) }
  );
  assert.equal(result.alerts, 1);
  assert.deepEqual(notifications, ['watch-2']);
  cleanup();
});

test('checkWatchlist stops after credits are exhausted', async () => {
  const initial = [
    { id: 'watch-1', type: 'query', query: 'lamp', country: '', name: 'Lamp', baseline: { price: 100, currency: 'PLN' }, alert: false, lastCheckedAt: null },
    { id: 'watch-2', type: 'query', query: 'desk', country: '', name: 'Desk', baseline: { price: 50, currency: 'PLN' }, alert: false, lastCheckedAt: null }
  ];
  const cleanup = storageHarness(initial);
  let calls = 0;
  await checkWatchlist(async () => {
    calls += 1;
    throw new ZureqError('CREDITS_EXHAUSTED', 'x');
  });
  assert.equal(calls, 1);
  const watches = await getWatches();
  assert.equal(watches[0].lastCheckedAt, null);
  assert.equal(watches[1].lastCheckedAt, null);
  cleanup();
});

test.afterEach(() => {
  delete globalThis.chrome;
});
