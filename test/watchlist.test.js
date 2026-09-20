import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addWatch, applyResult, checkWatchlist, evaluateWatch, getWatches
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
