import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../pagescan.js', import.meta.url), 'utf8');
const context = { globalThis: {} };
vm.runInNewContext(source, context);
const scan = context.globalThis.ZureqPageScan;

test('cleans marketplace title suffixes and noise', () => {
  assert.equal(scan.cleanTitle('DJI Mini 4 Pro Fly More Combo - Allegro.pl'), 'DJI Mini 4 Pro Fly More Combo');
  assert.equal(scan.cleanTitle('Sony Camera Alpha 7 IV : Amazon.de: Electronics and Photo'), 'Sony Camera Alpha 7 IV');
  assert.equal(scan.cleanTitle('One Two Three Four Five Six Seven Eight Nine Ten'), 'One Two Three Four Five Six Seven Eight');
});

test('parses Polish and euro prices', () => {
  assert.equal(scan.parsePrice('1 299,00 zł').value, 1299);
  assert.equal(scan.parsePrice('1 299,00 zł').currency, 'PLN');
  assert.equal(scan.parsePrice('€49.99').value, 49.99);
  assert.equal(scan.parsePrice('€49.99').currency, 'EUR');
});
