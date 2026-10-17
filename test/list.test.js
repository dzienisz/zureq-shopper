import assert from 'node:assert/strict';
import test from 'node:test';
import { groupListPicks, MAX_LIST_ITEMS, migrateListState, parseListInput } from '../list.js';

test('parses comma-separated and newline-separated list items', () => {
  assert.deepEqual(parseListInput(' desk lamp, usb c hub\n\nmonitor '), [
    'desk lamp',
    'usb c hub',
    'monitor'
  ]);
  assert.equal(MAX_LIST_ITEMS, 10);
});

test('migrates saved Build items and ignores preset fields', () => {
  const candidate = { sku: 'sku-1', shopId: 'shop-1', price: 12, currency: 'PLN' };
  const saved = {
    text: 'Gaming PC',
    templateId: 'gaming-pc',
    shippingPerShop: 25,
    optimizeResult: 'ignored',
    country: 'PL',
    parts: Array.from({ length: 12 }, (_, index) => ({
      name: `Item ${index + 1}`,
      query: `item ${index + 1}`,
      include: false,
      optional: true,
      candidates: index === 0 ? [candidate] : [],
      pick: index === 0 ? candidate : null
    }))
  };

  const migrated = migrateListState(saved, 'DE');
  assert.equal(migrated.country, 'PL');
  assert.equal(migrated.parts.length, MAX_LIST_ITEMS);
  assert.equal(migrated.text.split('\n').length, MAX_LIST_ITEMS);
  assert.equal(migrated.parts[0].pick.sku, 'sku-1');
  assert.deepEqual(Object.keys(migrated).sort(), ['country', 'parts', 'productDetails', 'text']);
  assert.equal('templateId' in migrated, false);
});

test('migrates a saved text-only list', () => {
  const migrated = migrateListState({ text: 'desk lamp, usb c hub' }, 'PL');
  assert.equal(migrated.text, 'desk lamp\nusb c hub');
  assert.equal(migrated.country, 'PL');
  assert.deepEqual(migrated.parts.map((part) => part.query), ['desk lamp', 'usb c hub']);
});

test('restores cached List product details from saved state', () => {
  const productDetails = { 'bizzle-pl::5451': { requiresVariant: true, variants: [{ sku: '5453' }] } };
  const migrated = migrateListState({ text: 't-shirt', productDetails });
  assert.deepEqual(migrated.productDetails, productDetails);
});

test('groups selected list candidates by shop and currency', () => {
  const parts = [
    { name: 'Desk lamp', pick: { shopId: 'shop-a', shopName: 'Shop A', sku: 'lamp', price: '19.95', currency: 'PLN' } },
    { name: 'USB hub', pick: { shopId: 'shop-a', shopName: 'Shop A', sku: 'hub', price: 25, currency: 'PLN' } },
    { name: 'Monitor', pick: { shopId: 'shop-b', shopName: 'Shop B', sku: 'monitor', price: 45, currency: 'eur' } },
    { name: 'Unpicked item', pick: null }
  ];

  const groups = groupListPicks(parts);
  assert.deepEqual(groups.map(({ shopId, shopName, picks, totals }) => ({
    shopId,
    shopName,
    items: picks.map(({ part }) => part.name),
    totals
  })), [
    {
      shopId: 'shop-a',
      shopName: 'Shop A',
      items: ['Desk lamp', 'USB hub'],
      totals: [{ currency: 'PLN', amount: 44.95 }]
    },
    {
      shopId: 'shop-b',
      shopName: 'Shop B',
      items: ['Monitor'],
      totals: [{ currency: 'EUR', amount: 45 }]
    }
  ]);
});
