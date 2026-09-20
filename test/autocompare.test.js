import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTO_COMPARE_TTL, cacheKey, getCached, pickBest, putCached } from '../autocompare.js';

const product = (price, currency = 'PLN') => ({
  name: `Product ${price}`,
  price,
  currency,
  shopName: 'Shop'
});

test('pickBest filters currency and reports cheaper offers', () => {
  const result = pickBest([product(250), product(199), product(80, 'EUR')], { price: 220, currency: 'PLN' });
  assert.equal(result.best.price, 199);
  assert.equal(result.cheaper, true);
  assert.equal(pickBest([product(250)], { price: 220, currency: 'PLN' }).cheaper, false);
});

test('cache entries expire after the configured TTL', () => {
  const cache = {};
  const key = cacheKey('PL', 'Camera');
  putCached(cache, key, product(10), 1000);
  assert.deepEqual(getCached(cache, key, 1000 + AUTO_COMPARE_TTL - 1), product(10));
  assert.equal(getCached(cache, key, 1000 + AUTO_COMPARE_TTL), null);
  assert.equal(getCached(cache, key, 1000 + AUTO_COMPARE_TTL + 1), null);
});

test('cache keeps at most 100 newest entries', () => {
  const cache = {};
  for (let index = 0; index < 101; index += 1) putCached(cache, `key-${index}`, product(index), index);
  assert.equal(Object.keys(cache).length, 100);
  assert.equal(cache['key-0'], undefined);
  assert.equal(cache['key-100'].best.price, 100);
});
