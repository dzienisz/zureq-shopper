import test from 'node:test';
import assert from 'node:assert/strict';
import { formatSavings, optimizeCart } from '../optimizer.js';

const candidate = (shopId, price, sku = `${shopId}-${price}`, currency = 'PLN') => ({
  shopId, shopName: shopId, sku, name: sku, price, currency, inStock: true
});

const parts = [
  { id: 'a', name: 'Frame', include: true, candidates: [candidate('shop-a', 100), candidate('shop-b', 105)] },
  { id: 'b', name: 'Motor', include: true, candidates: [candidate('shop-b', 100), candidate('shop-a', 105)] }
];

test('optimizer consolidates to one shop when shipping is high', () => {
  const result = optimizeCart(parts, { shippingPerShop: 20 });
  assert.equal(result.shopCount, 1);
  assert.deepEqual(result.assignments.map((item) => item.candidate.shopId), ['shop-a', 'shop-a']);
  assert.equal(result.total, 225);
  assert.match(formatSavings(result), /Optimized: 1 shops/);
});

test('zero shipping returns the cheapest-per-part baseline', () => {
  const result = optimizeCart(parts, { shippingPerShop: 0 });
  assert.deepEqual(result.assignments.map((item) => item.candidate.price), [100, 100]);
  assert.equal(result.shopCount, 2);
  assert.equal(result.total, 200);
  assert.equal(formatSavings(result), '');
});

test('ignores other-currency candidates and reports currency skips', () => {
  const result = optimizeCart([
    { id: 'a', name: 'Frame', include: true, candidates: [candidate('shop-a', 100), candidate('shop-b', 80, 'x', 'EUR')] },
    { id: 'b', name: 'Motor', include: true, candidates: [candidate('shop-c', 50, 'y', 'EUR')] }
  ], { currency: 'PLN' });
  assert.equal(result.assignments.length, 1);
  assert.equal(result.assignments[0].candidate.currency, 'PLN');
  assert.deepEqual(result.skipped, [{ id: 'b', name: 'Motor', reason: 'currency' }]);
});

test('skips parts with no candidates and excludes them from totals', () => {
  const result = optimizeCart([
    { id: 'a', name: 'Frame', include: true, candidates: [] },
    { id: 'b', name: 'Motor', include: true, candidates: [candidate('shop-a', 10)] }
  ], { shippingPerShop: 5 });
  assert.deepEqual(result.skipped, [{ id: 'a', name: 'Frame', reason: 'no-candidates' }]);
  assert.equal(result.itemsTotal, 10);
  assert.equal(result.total, 15);
});

test('reports baseline numbers and stays deterministic', () => {
  const first = optimizeCart(parts, { shippingPerShop: 20 });
  const second = optimizeCart(parts, { shippingPerShop: 20 });
  assert.deepEqual(first, second);
  assert.deepEqual(first.baseline, { itemsTotal: 200, shopCount: 2, shipping: 40, total: 240 });
});

test('does not treat missing prices as free', () => {
  const result = optimizeCart([{
    id: 'part',
    name: 'Part',
    include: true,
    candidates: [
      { shopId: 'free', shopName: 'Free', name: 'Missing price', price: null, currency: 'PLN' },
      { shopId: 'paid', shopName: 'Paid', name: 'Paid item', price: 100, currency: 'PLN' }
    ]
  }]);
  assert.equal(result.assignments[0].candidate.name, 'Paid item');
});
