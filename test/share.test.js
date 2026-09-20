import test from 'node:test';
import assert from 'node:assert/strict';
import { buildToMarkdown, decodeBuild, encodeBuild, serializeBuild, shareLink } from '../share.js';

const build = {
  text: '🚁 FPV build',
  templateId: 'fpv-drone',
  shippingPerShop: 15,
  parts: [
    {
      id: 0,
      name: '5 inch | frame',
      query: '5 inch frame',
      include: true,
      optional: false,
      candidates: [{ name: 'Mark4 frame', shopId: 'a', shopName: 'ShopA', sku: 'frame', price: 89, currency: 'PLN' }],
      pick: { name: 'Mark4 frame', shopId: 'a', shopName: 'ShopA', sku: 'frame', price: 89, currency: 'PLN' }
    },
    {
      id: 1,
      name: 'Motors',
      query: 'brushless motors',
      include: true,
      optional: false,
      candidates: [{ name: 'Motor set', shopId: 'b', shopName: 'ShopB', sku: 'motors', price: 120, currency: 'PLN' }],
      pick: { name: 'Motor set', shopId: 'b', shopName: 'ShopB', sku: 'motors', price: 120, currency: 'PLN' }
    },
    { id: 2, name: 'Antenna', query: 'antenna', include: true, optional: true, candidates: [], pick: null },
    { id: 3, name: 'Excluded', query: 'excluded', include: false, optional: false, candidates: [], pick: null }
  ],
  running: true,
  optimizeResult: 'old result'
};

test('encode and decode round-trip preserves picks and drops candidates', () => {
  const decoded = decodeBuild(encodeBuild(build));
  assert.equal(decoded.text, build.text);
  assert.equal(decoded.templateId, build.templateId);
  assert.equal(decoded.parts.length, 4);
  assert.equal(decoded.parts[0].id, 0);
  assert.deepEqual(decoded.parts[0].pick, build.parts[0].pick);
  assert.deepEqual(decoded.parts[0].candidates, [build.parts[0].pick]);
  assert.deepEqual(decoded.parts[2].candidates, []);
  assert.equal(decoded.running, false);
  assert.equal(decoded.optimizeResult, '');
});

test('decode accepts a full share URL', () => {
  const link = shareLink('chrome-extension://example/sidepanel.html', build);
  assert.equal(decodeBuild(link).parts[1].pick.sku, 'motors');
});

test('invalid build codes throw a stable error', () => {
  assert.throws(() => decodeBuild('not-a-build'), { message: 'Invalid build code' });
  const invalid = btoa(JSON.stringify({ v: 2, parts: [] })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  assert.throws(() => decodeBuild(invalid), { message: 'Invalid build code' });
});

test('serializeBuild keeps compact build state', () => {
  const serialized = serializeBuild(build);
  assert.equal(serialized.v, 1);
  assert.equal(serialized.parts[0].id, undefined);
  assert.equal(serialized.parts[0].candidates, undefined);
  assert.equal(serialized.running, undefined);
  assert.deepEqual(serialized.parts[0].pick, build.parts[0].pick);
});

test('build Markdown groups shops, includes unpicked parts, and escapes pipes', () => {
  assert.equal(buildToMarkdown(build), `# 🚁 FPV build

| Part | Pick | Shop | Price |
|---|---|---|---|
| 5 inch \\| frame | Mark4 frame | ShopA | 89.00 PLN |
| Motors | Motor set | ShopB | 120.00 PLN |
| Antenna | — | — | — |

**Per shop:** ShopA 89.00 PLN (1 item) · ShopB 120.00 PLN (1 item)
**Total:** 239.00 PLN (+ est. shipping 30.00 for 2 shops)
_Made with Zureq Shopper_`);
});
